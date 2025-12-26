import Foundation
import WebRTC
import AVFoundation

// MARK: - Connection State

enum WebRTCConnectionState {
    case disconnected
    case connecting
    case connected
    case failed(Error)
}

// MARK: - Delegate Protocol

protocol OpenAIWebRTCClientDelegate: AnyObject {
    func webRTCClient(_ client: OpenAIWebRTCClient, didChangeConnectionState state: WebRTCConnectionState)
    func webRTCClient(_ client: OpenAIWebRTCClient, didReceiveAudioTrack track: RTCAudioTrack)
    func webRTCClient(_ client: OpenAIWebRTCClient, didReceiveDataChannelMessage message: Data)
    func webRTCClient(_ client: OpenAIWebRTCClient, didEncounterError error: Error)
    func webRTCClientDataChannelDidOpen(_ client: OpenAIWebRTCClient)
    func webRTCClient(_ client: OpenAIWebRTCClient, didUpdateDataChannelInfo info: [String: Any])
    func webRTCClient(_ client: OpenAIWebRTCClient, didReceiveCallId callId: String)
}

// MARK: - Errors

enum WebRTCClientError: Error, LocalizedError {
    case failedToCreatePeerConnection
    case failedToCreateDataChannel
    case offerCreationFailed
    case answerFetchFailed(statusCode: Int)
    case answerParsingFailed
    case invalidURL
    case invalidState
    case connectionTimeout
    case dataChannelNotOpen
    
    var errorDescription: String? {
        switch self {
        case .failedToCreatePeerConnection:
            return "Failed to create peer connection"
        case .failedToCreateDataChannel:
            return "Failed to create data channel"
        case .offerCreationFailed:
            return "Failed to create offer"
        case .answerFetchFailed(let statusCode):
            return "Failed to get answer from OpenAI (status: \(statusCode))"
        case .answerParsingFailed:
            return "Failed to parse SDP answer"
        case .invalidURL:
            return "Invalid URL"
        case .invalidState:
            return "Invalid connection state"
        case .connectionTimeout:
            return "Connection timed out"
        case .dataChannelNotOpen:
            return "Data channel not open"
        }
    }
}

// MARK: - OpenAI WebRTC Client

/// Client for connecting to OpenAI's Realtime API via WebRTC
class OpenAIWebRTCClient: NSObject {
    
    // MARK: - Properties
    
    weak var delegate: OpenAIWebRTCClientDelegate?
    
    private(set) var connectionState: WebRTCConnectionState = .disconnected {
        didSet {
            delegate?.webRTCClient(self, didChangeConnectionState: connectionState)
        }
    }
    
    private var peerConnection: RTCPeerConnection?
    private var dataChannel: RTCDataChannel?
    private var localAudioTrack: RTCAudioTrack?
    private let rtcAudioSession = RTCAudioSession.sharedInstance()
    private var isMuted = false
    private var pendingCallId: String?  // Store until ICE connected

    private func dataChannelInfo(_ dataChannel: RTCDataChannel) -> [String: Any] {
        return [
            "label": dataChannel.label,
            "id": dataChannel.channelId,
            "state": dataChannel.readyState.rawValue,
            "ordered": dataChannel.isOrdered,
            "negotiated": dataChannel.isNegotiated,
            "maxRetransmits": dataChannel.maxRetransmits,
            "maxPacketLifeTime": dataChannel.maxPacketLifeTime,
            "protocol": dataChannel.`protocol`,
            "bufferedAmount": dataChannel.bufferedAmount
        ]
    }

    private func dataChannelInfoString(_ dataChannel: RTCDataChannel) -> String {
        let info = dataChannelInfo(dataChannel)
        return "label=\(info["label"] ?? "") id=\(info["id"] ?? "") state=\(info["state"] ?? "") ordered=\(info["ordered"] ?? "") negotiated=\(info["negotiated"] ?? "") maxRetransmits=\(info["maxRetransmits"] ?? "") maxPacketLifeTime=\(info["maxPacketLifeTime"] ?? "") protocol=\(info["protocol"] ?? "") bufferedAmount=\(info["bufferedAmount"] ?? "")"
    }

    private func emitDataChannelInfo(_ dataChannel: RTCDataChannel, event: String, extraInfo: [String: Any] = [:]) {
        var info = dataChannelInfo(dataChannel)
        info["event"] = event
        for (key, value) in extraInfo {
            info[key] = value
        }
        delegate?.webRTCClient(self, didUpdateDataChannelInfo: info)
    }
    
    // MARK: - Factory
    
    private static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let videoEncoderFactory = RTCDefaultVideoEncoderFactory()
        let videoDecoderFactory = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(
            encoderFactory: videoEncoderFactory,
            decoderFactory: videoDecoderFactory
        )
    }()
    
    // MARK: - Initialization
    
    // Connection timeout
    private static let connectionTimeoutSeconds: TimeInterval = 30
    private var connectionTimeoutTask: Task<Void, Never>?
    
    override init() {
        super.init()
        
        // Use manual audio mode so WebRTC doesn't fight CallKit for AVAudioSession
        rtcAudioSession.useManualAudio = true
        rtcAudioSession.isAudioEnabled = true
    }
    
    deinit {
        disconnect()
    }
    
    // MARK: - Connection
    
    func connect(ephemeralToken: String) async throws {
        connectionState = .connecting
        
        // Start connection timeout
        startConnectionTimeout()
        
        do {
            // Setup peer connection
            let config = RTCConfiguration()
            config.iceServers = [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]
            config.sdpSemantics = .unifiedPlan
            config.continualGatheringPolicy = .gatherContinually
            
            let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            
            guard let pc = OpenAIWebRTCClient.factory.peerConnection(
                with: config,
                constraints: constraints,
                delegate: self
            ) else {
                throw WebRTCClientError.failedToCreatePeerConnection
            }
            
            self.peerConnection = pc
            
            // Setup audio track
            let audioConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
            let audioSource = OpenAIWebRTCClient.factory.audioSource(with: audioConstraints)
            let audioTrack = OpenAIWebRTCClient.factory.audioTrack(with: audioSource, trackId: "audio0")
            audioTrack.isEnabled = true
            self.localAudioTrack = audioTrack
            
            // Add transceiver for send/receive
            let transceiverInit = RTCRtpTransceiverInit()
            transceiverInit.direction = .sendRecv
            transceiverInit.streamIds = ["audio-stream"]
            pc.addTransceiver(with: audioTrack, init: transceiverInit)
            
            // Setup data channel
            let dcConfig = RTCDataChannelConfiguration()
            dcConfig.isOrdered = true
            
            guard let dc = pc.dataChannel(forLabel: "oai-events", configuration: dcConfig) else {
                throw WebRTCClientError.failedToCreateDataChannel
            }
            dc.delegate = self
            self.dataChannel = dc
            print("[OpenAIWebRTCClient] Data channel created: \(dataChannelInfoString(dc))")
            emitDataChannelInfo(dc, event: "created")
            
            // Create offer
            let offerConstraints = RTCMediaConstraints(
                mandatoryConstraints: [
                    "OfferToReceiveAudio": "true",
                    "OfferToReceiveVideo": "false"
                ],
                optionalConstraints: nil
            )
            
            let offer = try await pc.offer(for: offerConstraints)
            try await pc.setLocalDescription(offer)
            
            // Send to OpenAI Realtime API
            let urlString = "https://api.openai.com/v1/realtime/calls"
            guard let url = URL(string: urlString) else {
                throw WebRTCClientError.invalidURL
            }
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/sdp", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(ephemeralToken)", forHTTPHeaderField: "Authorization")
            request.httpBody = offer.sdp.data(using: .utf8)
            
            let (data, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
                let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
                throw WebRTCClientError.answerFetchFailed(statusCode: statusCode)
            }
            
            // Extract call_id from Location header for sideband connection
            // Store it pending - only emit after ICE connection is established
            if let location = httpResponse.value(forHTTPHeaderField: "Location"),
               let callId = location.split(separator: "/").last.map(String.init) {
                print("[OpenAIWebRTCClient] Call ID received (pending ICE): \(callId)")
                pendingCallId = callId
            }
            
            guard let sdpAnswer = String(data: data, encoding: .utf8) else {
                throw WebRTCClientError.answerParsingFailed
            }
            
            let answer = RTCSessionDescription(type: .answer, sdp: sdpAnswer)
            try await pc.setRemoteDescription(answer)
            
        } catch {
            connectionState = .failed(error)
            throw error
        }
    }
    
    func disconnect() {
        cancelConnectionTimeout()
        
        pendingCallId = nil
        
        dataChannel?.close()
        dataChannel = nil
        
        localAudioTrack = nil
        peerConnection?.close()
        peerConnection = nil
        
        connectionState = .disconnected
    }
    
    // MARK: - Connection Timeout
    
    private func startConnectionTimeout() {
        cancelConnectionTimeout()
        
        connectionTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(OpenAIWebRTCClient.connectionTimeoutSeconds * 1_000_000_000))
            
            guard !Task.isCancelled else { return }
            
            await MainActor.run { [weak self] in
                guard let self = self else { return }
                
                // Only timeout if we're still connecting
                if case .connecting = self.connectionState {
                    print("[OpenAIWebRTCClient] Connection timeout after \(OpenAIWebRTCClient.connectionTimeoutSeconds)s")
                    self.connectionState = .failed(WebRTCClientError.connectionTimeout)
                }
            }
        }
    }
    
    private func cancelConnectionTimeout() {
        connectionTimeoutTask?.cancel()
        connectionTimeoutTask = nil
    }
    
    // MARK: - Audio Session (CallKit Integration)
    
    func audioSessionDidActivate(_ session: AVAudioSession) {
        print("[OpenAIWebRTCClient] Audio session activated by CallKit")
        rtcAudioSession.lockForConfiguration()
        defer { rtcAudioSession.unlockForConfiguration() }
        
        // Notify WebRTC that CallKit has activated the audio session
        // Do NOT call setActive(true) - CallKit already did that
        rtcAudioSession.audioSessionDidActivate(session)
        print("[OpenAIWebRTCClient] RTCAudioSession notified of activation")
    }
    
    func audioSessionDidDeactivate(_ session: AVAudioSession) {
        print("[OpenAIWebRTCClient] Audio session deactivated by CallKit")
        rtcAudioSession.lockForConfiguration()
        defer { rtcAudioSession.unlockForConfiguration() }
        
        // Notify WebRTC that CallKit has deactivated the audio session
        // Do NOT call setActive(false) - CallKit already did that
        rtcAudioSession.audioSessionDidDeactivate(session)
        print("[OpenAIWebRTCClient] RTCAudioSession notified of deactivation")
    }
    
    // MARK: - Mute Control
    
    var isMicrophoneMuted: Bool {
        get { isMuted }
        set {
            isMuted = newValue
            localAudioTrack?.isEnabled = !newValue
        }
    }
    
    // MARK: - Data Channel Events
    
    func sendEvent(_ event: [String: Any]) throws {
        guard let dataChannel = dataChannel,
              dataChannel.readyState == .open else {
            throw WebRTCClientError.invalidState
        }
        
        let data = try JSONSerialization.data(withJSONObject: event)
        let buffer = RTCDataBuffer(data: data, isBinary: false)
        dataChannel.sendData(buffer)
    }
    
}

// MARK: - RTCPeerConnectionDelegate

extension OpenAIWebRTCClient: RTCPeerConnectionDelegate {
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {
        print("[OpenAIWebRTCClient] Signaling state: \(stateChanged.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[OpenAIWebRTCClient] ICE connection state: \(newState.rawValue)")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            switch newState {
            case .connected, .completed:
                self.cancelConnectionTimeout()
                self.connectionState = .connected
                // Now safe to emit call ID for sideband connection
                if let callId = self.pendingCallId {
                    print("[OpenAIWebRTCClient] ICE connected, emitting call ID: \(callId)")
                    self.delegate?.webRTCClient(self, didReceiveCallId: callId)
                    self.pendingCallId = nil
                }
            case .disconnected, .failed:
                // No reconnection - ephemeral tokens expire quickly
                // Let the call fail and user can restart
                self.cancelConnectionTimeout()
                self.connectionState = .failed(WebRTCClientError.failedToCreatePeerConnection)
            case .closed:
                self.connectionState = .disconnected
            default:
                break
            }
        }
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {
        print("[OpenAIWebRTCClient] ICE gathering state: \(newState.rawValue)")
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        // ICE candidates gathered automatically
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {
        print("[OpenAIWebRTCClient] Data channel opened (server-side): \(dataChannelInfoString(dataChannel))")
        emitDataChannelInfo(dataChannel, event: "opened")
        dataChannel.delegate = self
    }
    
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams mediaStreams: [RTCMediaStream]) {
        print("[OpenAIWebRTCClient] Received remote track")
        if let audioTrack = rtpReceiver.track as? RTCAudioTrack {
            audioTrack.isEnabled = true
            delegate?.webRTCClient(self, didReceiveAudioTrack: audioTrack)
        }
    }
}

// MARK: - RTCDataChannelDelegate

extension OpenAIWebRTCClient: RTCDataChannelDelegate {
    
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        print("[OpenAIWebRTCClient] Data channel state: \(dataChannel.readyState.rawValue) (\(dataChannelInfoString(dataChannel)))")
        emitDataChannelInfo(dataChannel, event: "state_change")
        
        if dataChannel.readyState == .open {
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.delegate?.webRTCClientDataChannelDidOpen(self)
            }
        }
    }
    
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        print("[OpenAIWebRTCClient] Data channel message received: size=\(buffer.data.count) binary=\(buffer.isBinary) (\(dataChannelInfoString(dataChannel)))")
        emitDataChannelInfo(
            dataChannel,
            event: "message_received",
            extraInfo: ["message_size": buffer.data.count, "message_is_binary": buffer.isBinary]
        )
        delegate?.webRTCClient(self, didReceiveDataChannelMessage: buffer.data)
    }
}
