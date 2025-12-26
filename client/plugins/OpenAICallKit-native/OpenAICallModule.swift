//
//  OpenAICallModule.swift
//  OpenAICallKit
//
//  React Native bridge module for OpenAI Realtime API calls
//

import Foundation
import AVFoundation
import WebRTC

#if canImport(React)
import React
#endif

@objc(OpenAICallModule)
class OpenAICallModule: RCTEventEmitter {
    
    // MARK: - Properties
    
    private let callManager = OpenAICallManager.shared
    private var webRTCClient: OpenAIWebRTCClient?
    private var pendingSessionConfig: [String: Any]?
    
    // Thread-safe listener tracking
    private let listenerQueue = DispatchQueue(label: "com.bigwig.callmodule.listeners")
    private var _hasListeners = false
    private var hasListeners: Bool {
        get { listenerQueue.sync { _hasListeners } }
        set { listenerQueue.sync { _hasListeners = newValue } }
    }
    
    // Serial queue for all RTCAudioSession operations to prevent race conditions
    private let audioQueue = DispatchQueue(label: "com.bigwig.callmodule.audio")
    
    // Connection state tracking - must have BOTH before reporting connected
    private var isAudioSessionActive = false
    private var isWebRTCConnected = false
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        print("[OpenAICallModule] init - setting delegate on callManager")
        callManager.delegate = self
        print("[OpenAICallModule] init complete")
    }
    
    // MARK: - Module Registration
    
    @objc override static func moduleName() -> String! {
        return "OpenAICallModule"
    }
    
    @objc override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    // MARK: - Event Emitter
    
    override func supportedEvents() -> [String]! {
        return [
            "onCallStateChange",
            "onCallError",
            "onWebRTCEvent",
            "onCallId"
        ]
    }
    
    override func startObserving() {
        hasListeners = true
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    private func emit(_ name: String, body: [String: Any]) {
        guard hasListeners else { return }
        sendEvent(withName: name, body: body)
    }
    
    // MARK: - Exported Methods
    
    @objc(startCall:sessionConfig:resolver:rejecter:)
    func startCall(
        _ displayName: String,
        sessionConfig: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("E_DEALLOCATED", "Module was deallocated", nil)
                return
            }
            
            // Store session config for WebRTC connection
            self.pendingSessionConfig = sessionConfig as? [String: Any]
            
            // Create WebRTC client
            self.webRTCClient = OpenAIWebRTCClient()
            self.webRTCClient?.delegate = self
            
            do {
                try self.callManager.startCall(displayName: displayName)
                resolve(["success": true])
            } catch {
                self.pendingSessionConfig = nil
                self.webRTCClient = nil
                reject("E_START_FAILED", error.localizedDescription, error)
            }
        }
    }
    
    @objc(endCall:rejecter:)
    func endCall(
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async { [weak self] in
            self?.callManager.endCall()
            resolve(["success": true])
        }
    }
    
    @objc(setMuted:resolver:rejecter:)
    func setMuted(
        _ muted: Bool,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async { [weak self] in
            self?.callManager.setMuted(muted)
            self?.webRTCClient?.isMicrophoneMuted = muted
            resolve(["success": true, "muted": muted])
        }
    }
    
    @objc(setSpeakerEnabled:resolver:rejecter:)
    func setSpeakerEnabled(
        _ enabled: Bool,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Run on dedicated audio queue to prevent race conditions with CallKit audio activation
        audioQueue.async {
            do {
                let rtcSession = RTCAudioSession.sharedInstance()
                rtcSession.lockForConfiguration()
                defer { rtcSession.unlockForConfiguration() }
                
                // Only override output port - do NOT touch category/mode here
                try rtcSession.overrideOutputAudioPort(enabled ? .speaker : .none)
                
                DispatchQueue.main.async {
                    print("[OpenAICallModule] Speaker \(enabled ? "enabled" : "disabled")")
                    resolve(["success": true, "speakerEnabled": enabled])
                }
            } catch {
                DispatchQueue.main.async {
                    print("[OpenAICallModule] Speaker toggle error: \(error)")
                    reject("E_AUDIO_ROUTE", "Failed to set audio route: \(error.localizedDescription)", error)
                }
            }
        }
    }
    
    @objc(getCallState:rejecter:)
    func getCallState(
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(callManager.state.rawValue)
    }
    
    @objc(sendDataChannelMessage:resolver:rejecter:)
    func sendDataChannelMessage(
        _ message: NSDictionary,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                reject("E_DEALLOCATED", "Module was deallocated", nil)
                return
            }
            
            guard let dict = message as? [String: Any] else {
                reject("E_INVALID_MESSAGE", "Message must be a dictionary", nil)
                return
            }
            
            guard let client = self.webRTCClient else {
                reject("E_NO_CLIENT", "WebRTC client not initialized", nil)
                return
            }
            
            do {
                try client.sendEvent(dict)
                resolve(["success": true])
            } catch {
                reject("E_SEND_FAILED", error.localizedDescription, error)
            }
        }
    }
}

// MARK: - OpenAICallManagerDelegate

extension OpenAICallModule: OpenAICallManagerDelegate {
    
    func callManager(_ manager: OpenAICallManager, didActivateAudioSession audioSession: AVAudioSession) {
        // Run RTCAudioSession operations on the audio queue to prevent race conditions
        audioQueue.async { [weak self] in
            guard let self = self else { return }
            
            print("[OpenAICallModule] Audio session activated")
            self.webRTCClient?.audioSessionDidActivate(audioSession)
            
            DispatchQueue.main.async {
                self.isAudioSessionActive = true
                self.checkAndReportConnectedIfReady()
            }
        }
    }
    
    func callManager(_ manager: OpenAICallManager, didDeactivateAudioSession audioSession: AVAudioSession) {
        // Run RTCAudioSession operations on the audio queue to prevent race conditions
        audioQueue.async { [weak self] in
            guard let self = self else { return }
            
            print("[OpenAICallModule] Audio session deactivated")
            self.webRTCClient?.audioSessionDidDeactivate(audioSession)
            
            DispatchQueue.main.async {
                self.isAudioSessionActive = false
                self.isWebRTCConnected = false
            }
        }
    }
    
    /// Only report connected when BOTH audio session AND WebRTC are ready
    private func checkAndReportConnectedIfReady() {
        guard isAudioSessionActive && isWebRTCConnected else {
            print("[OpenAICallModule] Not ready yet - audio:\(isAudioSessionActive) webrtc:\(isWebRTCConnected)")
            return
        }
        print("[OpenAICallModule] Both ready - reporting connected")
        callManager.reportCallConnected()
    }
    
    func callManager(_ manager: OpenAICallManager, didChangeState state: OpenAICallState) {
        print("[OpenAICallModule] Call state changed: \(state.rawValue)")
        emit("onCallStateChange", body: ["state": state.rawValue])
        emit("onWebRTCEvent", body: ["type": "native_log", "message": "State changed to: \(state.rawValue)"])
    }
    
    func callManager(_ manager: OpenAICallManager, didFailWithError error: OpenAICallError) {
        print("[OpenAICallModule] Call failed: \(error.localizedDescription)")
        emit("onCallError", body: ["message": error.localizedDescription, "code": "E_CALL_FAILED"])
        emit("onWebRTCEvent", body: ["type": "native_log", "message": "ERROR: \(error.localizedDescription)"])
    }
    
    func callManager(_ manager: OpenAICallManager, didChangeMuteState isMuted: Bool) {
        print("[OpenAICallModule] Mute state changed: \(isMuted)")
        webRTCClient?.isMicrophoneMuted = isMuted
    }
    
    func callManager(_ manager: OpenAICallManager, didLog message: String) {
        print("[OpenAICallModule] Log: \(message)")
        emit("onWebRTCEvent", body: ["type": "native_log", "message": message])
    }
    
    func callManagerShouldConnectCall(_ manager: OpenAICallManager) {
        print("[OpenAICallModule] Should connect call")
        
        guard let sessionConfig = pendingSessionConfig,
              let ephemeralToken = sessionConfig["apiKey"] as? String else {
            emit("onCallError", body: ["message": "No API key provided", "code": "E_NO_TOKEN"])
            callManager.reportCallFailed(error: OpenAICallError.configurationError("No API key"))
            return
        }
        
        Task {
            do {
                try await webRTCClient?.connect(ephemeralToken: ephemeralToken)
                // Session update will be sent when data channel opens (see webRTCClientDataChannelDidOpen)
                print("[OpenAICallModule] WebRTC SDP exchange complete")
            } catch {
                print("[OpenAICallModule] WebRTC failed: \(error)")
                await MainActor.run {
                    self.callManager.reportCallFailed(error: error)
                    self.emit("onCallError", body: ["message": error.localizedDescription, "code": "E_WEBRTC_FAILED"])
                }
            }
        }
    }
    
    func callManagerShouldDisconnectCall(_ manager: OpenAICallManager) {
        print("[OpenAICallModule] Should disconnect call")
        webRTCClient?.disconnect()
        webRTCClient = nil
        pendingSessionConfig = nil
        isAudioSessionActive = false
        isWebRTCConnected = false
    }
}

// MARK: - OpenAIWebRTCClientDelegate

extension OpenAICallModule: OpenAIWebRTCClientDelegate {
    
    func webRTCClient(_ client: OpenAIWebRTCClient, didChangeConnectionState state: WebRTCConnectionState) {
        print("[OpenAICallModule] WebRTC state: \(state)")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            switch state {
            case .connected:
                self.isWebRTCConnected = true
                self.checkAndReportConnectedIfReady()
            case .failed(let error):
                self.isWebRTCConnected = false
                self.callManager.reportCallFailed(error: error)
            case .disconnected:
                self.isWebRTCConnected = false
            case .connecting:
                break
            }
        }
    }
    
    func webRTCClient(_ client: OpenAIWebRTCClient, didReceiveAudioTrack track: RTCAudioTrack) {
        print("[OpenAICallModule] Received remote audio track")
    }
    
    func webRTCClient(_ client: OpenAIWebRTCClient, didReceiveDataChannelMessage message: Data) {
        let messageText = String(data: message, encoding: .utf8)
        if let json = try? JSONSerialization.jsonObject(with: message) as? [String: Any],
           let type = json["type"] as? String {
            print("[OpenAICallModule] Received data channel event: \(type) bytes=\(message.count) body=\(json)")
            emit("onWebRTCEvent", body: json)
        } else {
            let preview = messageText ?? "<non-utf8>"
            print("[OpenAICallModule] Received data channel message bytes=\(message.count) body=\(preview)")
        }
    }
    
    func webRTCClient(_ client: OpenAIWebRTCClient, didEncounterError error: Error) {
        print("[OpenAICallModule] WebRTC error: \(error)")
        emit("onCallError", body: ["message": error.localizedDescription, "code": "E_WEBRTC"])
    }
    
    func webRTCClientDataChannelDidOpen(_ client: OpenAIWebRTCClient) {
        print("[OpenAICallModule] Data channel opened")
        // Session is already configured server-side when ephemeral key is created
        // No need to send session.update - matches React Native behavior
    }

    func webRTCClient(_ client: OpenAIWebRTCClient, didUpdateDataChannelInfo info: [String: Any]) {
        let eventType = info["event"] as? String ?? "unknown"
        print("[OpenAICallModule] Data channel info: \(eventType) \(info)")
        emit("onWebRTCEvent", body: ["type": "data_channel_info", "event": eventType, "info": info])
    }
    
    func webRTCClient(_ client: OpenAIWebRTCClient, didReceiveCallId callId: String) {
        print("[OpenAICallModule] Received call ID: \(callId)")
        emit("onCallId", body: ["callId": callId])
    }
}
