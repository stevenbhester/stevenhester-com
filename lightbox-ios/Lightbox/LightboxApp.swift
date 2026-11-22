import SwiftUI
import AVFoundation

@main
struct LightboxApp: App {
    @StateObject private var game = GameWeb()

    init() {
        // Game sounds mix with music and respect the silent switch.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                Color("LaunchBackground").ignoresSafeArea()
                GameWebView(game: game).ignoresSafeArea()
            }
            .preferredColorScheme(.light)
        }
    }
}
