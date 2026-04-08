import Foundation
import Capacitor
import WebKit
import UIKit

class KissflowNavigationHandler: NSObject, WKNavigationDelegate {
    
    static let kissflowDomain = "kissflow.com"
    static let kissflowAppStoreURL = "https://apps.apple.com/app/kissflow-digital-workplace/id1470220022"
    // Kissflow iOS app URL scheme (if available)
    static let kissflowURLScheme = "kissflow://"
    
    weak var originalDelegate: WKNavigationDelegate?
    
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        
        guard let url = navigationAction.request.url,
              let host = url.host else {
            decisionHandler(.allow)
            return
        }
        
        // Intercept Kissflow URLs
        if host.contains(KissflowNavigationHandler.kissflowDomain) {
            decisionHandler(.cancel)
            openInKissflowApp(url: url)
            return
        }
        
        // Allow all other URLs
        decisionHandler(.allow)
    }
    
    private func openInKissflowApp(url: URL) {
        let urlString = url.absoluteString
        
        // Try to open Kissflow native app via Universal Link
        if let universalURL = URL(string: urlString) {
            UIApplication.shared.open(universalURL, options: [.universalLinksOnly: true]) { success in
                if !success {
                    // Kissflow app not installed or doesn't handle this URL
                    // Open App Store
                    if let appStoreURL = URL(string: KissflowNavigationHandler.kissflowAppStoreURL) {
                        UIApplication.shared.open(appStoreURL, options: [:], completionHandler: nil)
                    }
                }
            }
        }
    }
}
