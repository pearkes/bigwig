import Foundation
import CallKit
import AVFoundation

// MARK: - Call State

/// Represents the lifecycle states of an OpenAI voice call
enum OpenAICallState: String {
    case idle           // No active call
    case starting       // Call request initiated, waiting for CallKit
    case connecting     // CallKit approved, establishing WebRTC connection
    case connected      // Audio session active, WebRTC streaming
    case ending         // End call requested, tearing down
    case ended          // Call fully terminated
    case failed         // Call failed with error
}

// MARK: - Errors

/// Errors that can occur during call management
enum OpenAICallError: Error, LocalizedError {
    case callAlreadyInProgress
    case noActiveCall
    case callKitError(Error)
    case audioSessionError(Error)
    case webRTCError(Error)
    case invalidState(current: OpenAICallState, expected: OpenAICallState)
    case configurationError(String)
    
    var errorDescription: String? {
        switch self {
        case .callAlreadyInProgress:
            return "A call is already in progress"
        case .noActiveCall:
            return "No active call to perform action on"
        case .callKitError(let error):
            return "CallKit error: \(error.localizedDescription)"
        case .audioSessionError(let error):
            return "Audio session error: \(error.localizedDescription)"
        case .webRTCError(let error):
            return "WebRTC error: \(error.localizedDescription)"
        case .invalidState(let current, let expected):
            return "Invalid state: currently \(current.rawValue), expected \(expected.rawValue)"
        case .configurationError(let message):
            return "Configuration error: \(message)"
        }
    }
}

// MARK: - Delegate Protocol

/// Delegate protocol for receiving call manager events
protocol OpenAICallManagerDelegate: AnyObject {
    func callManager(_ manager: OpenAICallManager, didActivateAudioSession audioSession: AVAudioSession)
    func callManager(_ manager: OpenAICallManager, didDeactivateAudioSession audioSession: AVAudioSession)
    func callManager(_ manager: OpenAICallManager, didChangeState state: OpenAICallState)
    func callManager(_ manager: OpenAICallManager, didFailWithError error: OpenAICallError)
    func callManager(_ manager: OpenAICallManager, didChangeMuteState isMuted: Bool)
    func callManagerShouldConnectCall(_ manager: OpenAICallManager)
    func callManagerShouldDisconnectCall(_ manager: OpenAICallManager)
    func callManager(_ manager: OpenAICallManager, didLog message: String)
}

// MARK: - OpenAICallManager

/// Singleton manager for CallKit integration with OpenAI Realtime API
final class OpenAICallManager: NSObject {
    
    // MARK: - Singleton
    
    static let shared = OpenAICallManager()
    
    // MARK: - Properties
    
    weak var delegate: OpenAICallManagerDelegate?
    
    private(set) var state: OpenAICallState = .idle
    private(set) var isMuted: Bool = false
    private var currentCallUUID: UUID?
    private var currentDisplayName: String?
    private var hasReportedError: Bool = false // Prevents double error reporting
    
    // MARK: - Thread-Safe State Updates
    
    /// Updates state on main thread and notifies delegate
    private func updateState(_ newState: OpenAICallState) {
        if !Thread.isMainThread {
            DispatchQueue.main.async { [weak self] in
                self?.updateState(newState)
            }
            return
        }
        
        guard state != newState else { return }
        let oldState = state
        state = newState
        print("[OpenAICallManager] State: \(oldState.rawValue) -> \(newState.rawValue)")
        delegate?.callManager(self, didChangeState: newState)
    }
    
    // MARK: - CallKit Components
    
    private let provider: CXProvider
    private let callController: CXCallController
    
    // MARK: - Initialization
    
    private override init() {
        // Create configuration first
        let configuration = CXProviderConfiguration(localizedName: "Bigwig")
        configuration.supportsVideo = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.maximumCallGroups = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        
        // Create provider and controller eagerly
        self.provider = CXProvider(configuration: configuration)
        self.callController = CXCallController()
        
        super.init()
        
        print("[OpenAICallManager] init - registering provider delegate")
        self.provider.setDelegate(self, queue: nil)
        print("[OpenAICallManager] init complete - provider: \(self.provider)")
    }
    
    // MARK: - Audio Session Preparation
    
    /// Prepares audio session before starting CallKit transaction
    private func prepareAudioSessionForCall() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.allowBluetooth, .allowBluetoothA2DP, .duckOthers]
        )
        // Note: Do NOT call setActive(true) - CallKit will do that
    }
    
    // MARK: - Public API
    
    func startCall(displayName: String) throws {
        guard state == .idle || state == .ended || state == .failed else {
            throw OpenAICallError.callAlreadyInProgress
        }
        
        // Debug: verify provider is alive
        print("[OpenAICallManager] Provider: \(provider)")
        delegate?.callManager(self, didLog: "Provider: \(provider), controller: \(callController)")
        
        // Prepare audio session before CallKit transaction
        do {
            try prepareAudioSessionForCall()
        } catch {
            throw OpenAICallError.audioSessionError(error)
        }
        
        let callUUID = UUID()
        currentCallUUID = callUUID
        currentDisplayName = displayName
        
        updateState(.starting)
        
        let handle = CXHandle(type: .generic, value: "openai-assistant")
        let startCallAction = CXStartCallAction(call: callUUID, handle: handle)
        startCallAction.isVideo = false
        startCallAction.contactIdentifier = displayName
        
        let transaction = CXTransaction(action: startCallAction)
        
        print("[OpenAICallManager] Requesting CallKit transaction...")
        delegate?.callManager(self, didLog: "Requesting CallKit transaction...")
        callController.request(transaction) { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                print("[OpenAICallManager] CallKit transaction FAILED: \(error.localizedDescription)")
                self.delegate?.callManager(self, didLog: "CallKit FAILED: \(error.localizedDescription)")
                self.handleCallError(.callKitError(error))
            } else {
                print("[OpenAICallManager] CallKit transaction succeeded, waiting for provider callbacks")
                self.delegate?.callManager(self, didLog: "CallKit transaction OK, waiting for callbacks")
            }
        }
    }
    
    func endCall() {
        guard let callUUID = currentCallUUID else {
            delegate?.callManager(self, didFailWithError: .noActiveCall)
            return
        }
        
        updateState(.ending)
        
        let endCallAction = CXEndCallAction(call: callUUID)
        let transaction = CXTransaction(action: endCallAction)
        
        callController.request(transaction) { [weak self] error in
            if let error = error {
                self?.handleCallError(.callKitError(error))
            }
        }
    }
    
    func setMuted(_ muted: Bool) {
        guard let callUUID = currentCallUUID else {
            delegate?.callManager(self, didFailWithError: .noActiveCall)
            return
        }
        
        let muteAction = CXSetMutedCallAction(call: callUUID, muted: muted)
        let transaction = CXTransaction(action: muteAction)
        
        callController.request(transaction) { [weak self] error in
            if let error = error {
                self?.handleCallError(.callKitError(error))
            }
        }
    }
    
    func reportCallConnected() {
        guard let callUUID = currentCallUUID else { return }
        provider.reportOutgoingCall(with: callUUID, connectedAt: Date())
        updateState(.connected)
    }
    
    func reportCallFailed(error: Error) {
        handleCallError(.webRTCError(error))
    }
    
    // MARK: - Private Helpers
    
    /// Centralized error handler - always notifies JS and CallKit
    private func handleCallError(_ error: OpenAICallError) {
        // Guard against double error reporting
        guard !hasReportedError else {
            print("[OpenAICallManager] Error already reported, ignoring: \(error.localizedDescription)")
            return
        }
        hasReportedError = true
        
        print("[OpenAICallManager] Error: \(error.localizedDescription)")
        
        // Report to CallKit if we have an active call
        if let callUUID = currentCallUUID {
            provider.reportCall(with: callUUID, endedAt: Date(), reason: .failed)
        }
        
        // Clean up call state
        cleanupAfterCallEnd()
        
        // Update state to failed
        updateState(.failed)
        
        // Notify delegate
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.callManager(self, didFailWithError: error)
        }
    }
    
    /// Cleans up call state (called on end or failure)
    private func cleanupAfterCallEnd() {
        currentCallUUID = nil
        currentDisplayName = nil
        isMuted = false
        hasReportedError = false
    }
    
    private func resetCallState() {
        cleanupAfterCallEnd()
        updateState(.idle)
    }
}

// MARK: - CXProviderDelegate

extension OpenAICallManager: CXProviderDelegate {
    
    func providerDidReset(_ provider: CXProvider) {
        print("[OpenAICallManager] Provider did reset - this ends all calls!")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.callManager(self, didLog: "PROVIDER RESET - all calls ended!")
            self.delegate?.callManagerShouldDisconnectCall(self)
            self.resetCallState()
        }
    }
    
    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        print("[OpenAICallManager] Performing start call action")
        delegate?.callManager(self, didLog: "CXStartCallAction being performed")
        
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "openai-assistant")
        update.localizedCallerName = currentDisplayName
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        provider.reportCall(with: action.callUUID, updated: update)
        
        updateState(.connecting)
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.callManagerShouldConnectCall(self)
        }
        
        action.fulfill()
        provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: Date())
    }
    
    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        print("[OpenAICallManager] Performing END call action - call is ending!")
        delegate?.callManager(self, didLog: "CXEndCallAction - call ending!")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.callManagerShouldDisconnectCall(self)
        }
        
        cleanupAfterCallEnd()
        updateState(.ended)
        
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        print("[OpenAICallManager] Performing set muted action: \(action.isMuted)")
        
        isMuted = action.isMuted
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.callManager(self, didChangeMuteState: action.isMuted)
        }
        
        action.fulfill()
    }
    
    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        print("[OpenAICallManager] Audio session activated")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.callManager(self, didActivateAudioSession: audioSession)
        }
    }
    
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("[OpenAICallManager] Audio session deactivated (current state: \(state.rawValue))")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.callManager(self, didDeactivateAudioSession: audioSession)
            
            // Only transition to .idle if we're in a terminal state (ending/ended)
            // Do NOT reset during connection phases - CallKit may deactivate/reactivate during setup
            switch self.state {
            case .ending, .ended:
                self.updateState(.idle)
            case .failed:
                // Preserve failure state for JS to handle
                break
            default:
                // During starting/connecting/connected, don't reset - this may be a transient deactivation
                print("[OpenAICallManager] Ignoring deactivate during \(self.state.rawValue)")
            }
        }
    }
    
    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        action.fail() // Not supported
    }
    
    func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
        action.fail() // Not supported
    }
    
    func provider(_ provider: CXProvider, perform action: CXSetGroupCallAction) {
        action.fail() // Not supported
    }
    
    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        action.fail() // Incoming calls not supported
    }
}
