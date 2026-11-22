import SwiftUI
import WebKit

@main
struct FaultlineApp: App {
    var body: some Scene {
        WindowGroup {
            FaultlineView()
                .preferredColorScheme(.dark)
        }
    }
}

struct FaultlineView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let game = WKWebView()
        game.isOpaque = false
        game.backgroundColor = UIColor(red: 10/255, green: 16/255, blue: 23/255, alpha: 1)
        game.scrollView.bounces = false
        if let file = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") {
            game.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
        }
        return game
    }

    func updateUIView(_ view: WKWebView, context: Context) {}
}
