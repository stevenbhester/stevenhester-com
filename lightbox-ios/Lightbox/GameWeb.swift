import SwiftUI
import WebKit

/// The game is the web app in the bundled "lightbox" folder, shown in a web view.
/// Nothing is fetched from the internet: `BundledFiles` hands the web view its files straight from the app,
/// under the made-up address lightbox://app/, so the game works offline and keeps its saved progress.
/// This shell adds the phone's haptics.
final class GameWeb: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let scheme = "lightbox"
    let webView: WKWebView

    /// `-liveURL http://192.168.1.20:8765/lightbox/` (a launch argument) loads the game from a server instead,
    /// which saves rebuilding the app while changing the game.
    private var start: URL {
        if let s = UserDefaults.standard.string(forKey: "liveURL"), let u = URL(string: s) { return u }
        return URL(string: "\(GameWeb.scheme)://app/index.html")!
    }

    override init() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundledFiles(), forURLScheme: GameWeb.scheme)
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        config.applicationNameForUserAgent = "LightboxApp/\(version) (\(build))"
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(WeakHandler(self), name: "lightbox")
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.allowsLinkPreview = false
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        webView.load(URLRequest(url: start))
    }

    // MARK: messages from the page
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if let kind = body["haptic"] as? String { Haptics.play(kind) }
    }

    // MARK: navigation
    /// Links that leave the game open in Safari.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.allow) }
        let inGame = url.scheme == GameWeb.scheme || url.host == start.host
        if action.navigationType == .linkActivated && !inGame {
            UIApplication.shared.open(url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.load(URLRequest(url: start))
    }
}

/// Serves lightbox://app/<path> from the "lightbox" folder inside the app.
final class BundledFiles: NSObject, WKURLSchemeHandler {
    private let root: URL = (Bundle.main.resourceURL ?? Bundle.main.bundleURL).appendingPathComponent("lightbox", isDirectory: true).standardizedFileURL

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path
        if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
        if path.hasPrefix("/") { path.removeFirst() }
        let file = root.appendingPathComponent(path).standardizedFileURL
        // Only files inside the game's folder.
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            return task.didFailWithError(URLError(.fileDoesNotExist))
        }
        let headers = [
            "Content-Type": BundledFiles.mime(for: file.pathExtension.lowercased()),
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            return task.didFailWithError(URLError(.cannotParseResponse))
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    /// The web view only runs scripts and styles that arrive labelled as such.
    private static func mime(for ext: String) -> String {
        switch ext {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}

/// WKUserContentController retains its handlers; this avoids a retain cycle.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { target?.userContentController(c, didReceive: m) }
}

enum Haptics {
    private static let selection = UISelectionFeedbackGenerator()
    private static let notify = UINotificationFeedbackGenerator()
    static func play(_ kind: String) {
        switch kind {
        case "tick": selection.selectionChanged(); selection.prepare()
        case "success": notify.notificationOccurred(.success)
        case "warning": notify.notificationOccurred(.warning)
        case "error": notify.notificationOccurred(.error)
        default: break
        }
    }
}

struct GameWebView: UIViewRepresentable {
    @ObservedObject var game: GameWeb
    func makeUIView(context: Context) -> WKWebView { game.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
