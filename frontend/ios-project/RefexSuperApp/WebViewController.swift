import UIKit
import WebKit

class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var webView: WKWebView!
    private let appURL = "https://refexone.com"
    private let updateCheckURL = "https://refexone.com/api/app-update/check"
    private let kissflowDomain = "kissflow.com"
    private let kissflowPackage = "com.orangescape.kfdw"
    private let kissflowAppStoreURL = "https://apps.apple.com/app/kissflow-digital-workplace/id1470220022"
    private var forceUpdateBlocking = false

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

        checkForAppUpdate { [weak self] in
            self?.loadMainApp()
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .darkContent
    }

    private func loadMainApp() {
        if let url = URL(string: appURL) {
            webView.load(URLRequest(url: url))
        }
    }

    // MARK: - App Update Control

    private func checkForAppUpdate(completion: @escaping () -> Void) {
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        guard let url = URL(string: "\(updateCheckURL)?platform=ios&build=\(build)") else {
            completion()
            return
        }

        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self = self,
                      error == nil,
                      let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      (json["enabled"] as? Bool) == true else {
                    completion()
                    return
                }

                let force = (json["force_update"] as? Bool) == true
                let available = (json["update_available"] as? Bool) == true || force
                guard available else {
                    completion()
                    return
                }

                let title = (json["title"] as? String) ?? (force ? "Update required" : "Update available")
                let message = (json["message"] as? String) ?? "A new version of RefexOne is available."
                let storeURL = (json["store_url"] as? String) ?? "https://apps.apple.com/"

                if !force {
                    // Soft update: load app, then prompt
                    completion()
                } else {
                    self.forceUpdateBlocking = true
                }

                let current = json["current_build"] as? Int
                let latest = json["latest_build"] as? Int
                self.presentUpdateCard(
                    title: title,
                    message: message,
                    storeURL: storeURL,
                    force: force,
                    currentBuild: current,
                    latestBuild: latest,
                    completion: completion
                )
            }
        }.resume()
    }

    private func presentUpdateCard(
        title: String,
        message: String,
        storeURL: String,
        force: Bool,
        currentBuild: Int?,
        latestBuild: Int?,
        completion: @escaping () -> Void
    ) {
        view.subviews.filter { $0.tag == 99113 }.forEach { $0.removeFromSuperview() }

        let overlay = UIView(frame: view.bounds)
        overlay.tag = 99113
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = UIColor.black.withAlphaComponent(0.48)
        overlay.alpha = 0

        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = .white
        card.layer.cornerRadius = 28
        card.clipsToBounds = true

        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.backgroundColor = UIColor(red: 0.02, green: 0.59, blue: 0.41, alpha: 1)

        let iconWrap = UIView()
        iconWrap.translatesAutoresizingMaskIntoConstraints = false
        iconWrap.backgroundColor = UIColor.white.withAlphaComponent(0.2)
        iconWrap.layer.cornerRadius = 36

        let icon = UIImageView(image: UIImage(systemName: "arrow.down.app.fill"))
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.tintColor = .white
        icon.contentMode = .scaleAspectFit

        let badge = UILabel()
        badge.translatesAutoresizingMaskIntoConstraints = false
        badge.text = force ? "Required update" : "Optional update"
        badge.font = .systemFont(ofSize: 11, weight: .bold)
        badge.textAlignment = .center
        badge.layer.cornerRadius = 11
        badge.clipsToBounds = true
        badge.textColor = force ? UIColor(red: 0.73, green: 0.11, blue: 0.11, alpha: 1) : UIColor(red: 0.02, green: 0.47, blue: 0.34, alpha: 1)
        badge.backgroundColor = force ? UIColor(red: 0.98, green: 0.95, blue: 0.95, alpha: 1) : UIColor(red: 0.93, green: 0.99, blue: 0.96, alpha: 1)

        let titleLabel = UILabel()
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 20, weight: .bold)
        titleLabel.textColor = UIColor(red: 0.06, green: 0.09, blue: 0.16, alpha: 1)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        let messageLabel = UILabel()
        messageLabel.translatesAutoresizingMaskIntoConstraints = false
        messageLabel.text = message
        messageLabel.font = .systemFont(ofSize: 14, weight: .regular)
        messageLabel.textColor = UIColor(red: 0.39, green: 0.45, blue: 0.55, alpha: 1)
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        let meta = UILabel()
        meta.translatesAutoresizingMaskIntoConstraints = false
        if let currentBuild, let latestBuild {
            meta.text = "Your build \(currentBuild)  ·  Latest \(latestBuild)"
            meta.isHidden = false
        } else {
            meta.isHidden = true
        }
        meta.font = .systemFont(ofSize: 12, weight: .regular)
        meta.textColor = UIColor(red: 0.58, green: 0.64, blue: 0.72, alpha: 1)
        meta.textAlignment = .center

        let updateBtn = UIButton(type: .system)
        updateBtn.translatesAutoresizingMaskIntoConstraints = false
        updateBtn.setTitle("Update now", for: .normal)
        updateBtn.setTitleColor(.white, for: .normal)
        updateBtn.titleLabel?.font = .systemFont(ofSize: 15, weight: .bold)
        updateBtn.backgroundColor = UIColor(red: 0.02, green: 0.59, blue: 0.41, alpha: 1)
        updateBtn.layer.cornerRadius = 16

        let laterBtn = UIButton(type: .system)
        laterBtn.translatesAutoresizingMaskIntoConstraints = false
        laterBtn.setTitle("Remind me later", for: .normal)
        laterBtn.setTitleColor(UIColor(red: 0.28, green: 0.33, blue: 0.41, alpha: 1), for: .normal)
        laterBtn.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
        laterBtn.backgroundColor = UIColor(red: 0.97, green: 0.98, blue: 0.99, alpha: 1)
        laterBtn.layer.cornerRadius = 16
        laterBtn.layer.borderWidth = 1
        laterBtn.layer.borderColor = UIColor(red: 0.89, green: 0.91, blue: 0.94, alpha: 1).cgColor
        laterBtn.isHidden = force

        view.addSubview(overlay)
        overlay.addSubview(card)
        card.addSubview(header)
        header.addSubview(iconWrap)
        iconWrap.addSubview(icon)
        header.addSubview(badge)
        card.addSubview(titleLabel)
        card.addSubview(messageLabel)
        card.addSubview(meta)
        card.addSubview(updateBtn)
        card.addSubview(laterBtn)

        NSLayoutConstraint.activate([
            card.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            card.leadingAnchor.constraint(equalTo: overlay.leadingAnchor, constant: 28),
            card.trailingAnchor.constraint(equalTo: overlay.trailingAnchor, constant: -28),

            header.topAnchor.constraint(equalTo: card.topAnchor),
            header.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: card.trailingAnchor),

            iconWrap.topAnchor.constraint(equalTo: header.topAnchor, constant: 28),
            iconWrap.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            iconWrap.widthAnchor.constraint(equalToConstant: 72),
            iconWrap.heightAnchor.constraint(equalToConstant: 72),

            icon.centerXAnchor.constraint(equalTo: iconWrap.centerXAnchor),
            icon.centerYAnchor.constraint(equalTo: iconWrap.centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 32),
            icon.heightAnchor.constraint(equalToConstant: 32),

            badge.topAnchor.constraint(equalTo: iconWrap.bottomAnchor, constant: 16),
            badge.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            badge.heightAnchor.constraint(equalToConstant: 22),
            badge.widthAnchor.constraint(greaterThanOrEqualToConstant: 110),
            badge.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -20),
            badge.leadingAnchor.constraint(greaterThanOrEqualTo: header.leadingAnchor, constant: 24),
            badge.trailingAnchor.constraint(lessThanOrEqualTo: header.trailingAnchor, constant: -24),

            titleLabel.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 22),
            titleLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            titleLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),

            messageLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 10),
            messageLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            messageLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),

            meta.topAnchor.constraint(equalTo: messageLabel.bottomAnchor, constant: 14),
            meta.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            meta.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),

            updateBtn.topAnchor.constraint(equalTo: meta.bottomAnchor, constant: 22),
            updateBtn.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            updateBtn.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
            updateBtn.heightAnchor.constraint(equalToConstant: 52),

            laterBtn.topAnchor.constraint(equalTo: updateBtn.bottomAnchor, constant: 10),
            laterBtn.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            laterBtn.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
            laterBtn.heightAnchor.constraint(equalToConstant: 48),
            laterBtn.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: force ? -24 : -24)
        ])

        if force {
            laterBtn.removeFromSuperview()
            updateBtn.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24).isActive = true
        }

        updateBtn.addAction(UIAction { [weak self] _ in
            guard let self = self else { return }
            if let store = URL(string: storeURL) {
                UIApplication.shared.open(store)
            }
            if force {
                self.forceUpdateBlocking = true
                overlay.removeFromSuperview()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self.checkForAppUpdate(completion: completion)
                }
            } else {
                UIView.animate(withDuration: 0.2, animations: { overlay.alpha = 0 }) { _ in
                    overlay.removeFromSuperview()
                }
            }
        }, for: .touchUpInside)

        laterBtn.addAction(UIAction { [weak self] _ in
            self?.forceUpdateBlocking = false
            UIView.animate(withDuration: 0.2, animations: { overlay.alpha = 0 }) { _ in
                overlay.removeFromSuperview()
            }
        }, for: .touchUpInside)

        UIView.animate(withDuration: 0.25) { overlay.alpha = 1 }
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
                    UIApplication.shared.open(appStoreURL)
                }
            }
        }
    }
}
