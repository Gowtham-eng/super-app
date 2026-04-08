import UIKit
import WebKit

class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var webView: WKWebView!
    private let appURL = "https://kissflow-access-hub.preview.emergentagent.com"
    private let kissflowDomain = "kissflow.com"
    private let kissflowPackage = "com.orangescape.kfdw"
    private let kissflowAppStoreURL = "https://apps.apple.com/app/kissflow-digital-workplace/id1470220022"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .always

        view.addSubview(webView)

        // Load the Refex Super App
        if let url = URL(string: appURL) {
            webView.load(URLRequest(url: url))
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .darkContent
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {

        guard let url = navigationAction.request.url,
              let host = url.host else {
            decisionHandler(.allow)
            return
        }

        // Intercept Kissflow URLs — open native app or App Store
        if host.contains(kissflowDomain) {
            decisionHandler(.cancel)
            openKissflowApp(url: url)
            return
        }

        // Allow our own app and SAML POST forms
        decisionHandler(.allow)
    }

    // Handle target="_blank" links
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if let host = url.host, host.contains(kissflowDomain) {
                openKissflowApp(url: url)
                return nil
            }
            // Load target=_blank URLs in the same webview
            webView.load(navigationAction.request)
        }
        return nil
    }

    // MARK: - Kissflow Native App

    private func openKissflowApp(url: URL) {
        // Try opening via Universal Link first (opens native app if installed)
        UIApplication.shared.open(url, options: [.universalLinksOnly: true]) { [weak self] success in
            if !success {
                // Native app not installed or doesn't handle this URL
                // Redirect to App Store
                if let appStoreURL = URL(string: self?.kissflowAppStoreURL ?? "") {
                    UIApplication.shared.open(appStoreURL, options: [:], completionHandler: nil)
                }
            }
        }
    }
}
