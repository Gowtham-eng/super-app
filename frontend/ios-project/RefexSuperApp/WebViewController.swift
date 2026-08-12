import UIKit
import WebKit

/// Mirrors Android `com.refex.refexone.MainActivity` flow:
/// Kissflow stays in-app with a close bar, SAML module redirect, and JS bridge.
class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {

    private enum CloseBarMode {
        case hidden
        case compact
        case full
    }

    private let appHost = "refexone.com"
    private let kissflowDomain = "kissflow.com"
    private let launcherURL = "https://refexone.com/launcher"
    /// Root URL — web app routes to login or dashboard/launcher (same as Android Capacitor).
    private let appURL = "https://refexone.com/"
    private let updateCheckURL = "https://refexone.com/api/app-update/check"
    private let samlAcsPath = "/signin/"
    private let samlLoginPath = "/view/login"
    private let moduleRedirectDelayMs: TimeInterval = 2.0
    private let bridgeName = "RefexOneBridge"

    private var webView: WKWebView!
    private var closeBar: UIView!
    private var backButton: UIButton!
    private var refreshButton: UIButton!
    private var brandTitle: UILabel!
    private var subtitleLabel: UILabel!
    private var pageLoader: UIView!
    private var closeBarHeightConstraint: NSLayoutConstraint!
    private var webViewTopToCloseBar: NSLayoutConstraint!
    private var webViewTopToSafeArea: NSLayoutConstraint!
    private var webViewBottomConstraint: NSLayoutConstraint!

    private var pendingModuleUrl: String?
    private var pendingHistoryClear = false
    private var moduleRedirectScheduled = false
    private var pageRefreshPending = false
    private var forceUpdateBlocking = false
    private var isReturningToLauncher = false
    private var currentCloseBarMode: CloseBarMode = .hidden
    private var hideLoaderWorkItem: DispatchWorkItem?
    private var moduleRedirectWorkItem: DispatchWorkItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.925, green: 0.992, blue: 0.961, alpha: 1) // #ECFDF5

        setupWebView()
        setupCloseBar()
        setupPageLoader()
        setupKeyboardHandling()

        checkForAppUpdate { [weak self] in
            self?.loadMainApp()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: bridgeName)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    // MARK: - Setup

    private func setupWebView() {
        let userContent = WKUserContentController()
        userContent.add(self, name: bridgeName)
        userContent.addUserScript(WKUserScript(
            source: bridgeInjectionScript(),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        ))
        userContent.addUserScript(WKUserScript(
            source: viewportAndResponsiveScript(),
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.userContentController = userContent
        config.websiteDataStore = .default()
        if #available(iOS 14.0, *) {
            config.defaultWebpagePreferences.allowsContentJavaScript = true
        }

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Automatic insets help keyboard / safe-area; we also pad for keyboard explicitly.
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.delegate = self
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        webView.isOpaque = false
        webView.backgroundColor = .white

        view.addSubview(webView)
        webViewBottomConstraint = webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webViewBottomConstraint,
        ])
        webViewTopToSafeArea = webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        webViewTopToSafeArea.isActive = true
    }

    private func bridgeInjectionScript() -> String {
        """
        (function(){
          try { Object.defineProperty(navigator, 'standalone', { get: function(){ return true; }, configurable: true }); } catch (e) {}
          // Make AppLauncher use Android-like mobileFlow inside this WKWebView shell.
          if (!window.Capacitor) {
            window.Capacitor = {
              isNativePlatform: function() { return true; },
              getPlatform: function() { return 'ios'; }
            };
          }
          if (window.RefexOneBridge) return;
          function post(action, url) {
            try {
              window.webkit.messageHandlers.\(bridgeName).postMessage({action: action, url: url || ''});
            } catch (e) {}
          }
          window.RefexOneBridge = {
            setPendingModule: function(url) { post('setPendingModule', url); },
            clearKissflowSession: function() { post('clearKissflowSession'); },
            clearAppSession: function() { post('clearAppSession'); }
          };
        })();
        """
    }

    /// Prevent iOS input-zoom and keep login/dashboard usable with the keyboard.
    private func viewportAndResponsiveScript() -> String {
        """
        (function(){
          try {
            var meta = document.querySelector('meta[name="viewport"]');
            var content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
            if (meta) { meta.setAttribute('content', content); }
            else {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              meta.content = content;
              document.head.appendChild(meta);
            }
            var style = document.getElementById('refexone-ios-responsive');
            if (!style) {
              style = document.createElement('style');
              style.id = 'refexone-ios-responsive';
              style.textContent = [
                'html, body { width: 100%; max-width: 100%; overflow-x: hidden; }',
                'input, textarea, select, [contenteditable] { font-size: 16px !important; }',
                '.min-h-screen { min-height: 100dvh !important; min-height: -webkit-fill-available !important; }',
                '[data-testid="login-page"] { min-height: 100dvh !important; width: 100% !important; max-width: 100vw !important; }',
                '[data-testid="login-page"] > div:last-child { width: 100%; max-width: 100%; padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right)); padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); box-sizing: border-box; }',
                '[data-testid="app-launcher"], [data-testid="dashboard-page"] { max-width: 100vw; overflow-x: hidden; }'
              ].join('\\n');
              document.head.appendChild(style);
            }
            // Bounce /login when already signed in
            try {
              var token = localStorage.getItem('iam_token') || '';
              var path = location.pathname || '';
              var q = location.search || '';
              if (token && path.indexOf('/login') === 0 &&
                  q.indexOf('oidc_redirect=') === -1 &&
                  q.indexOf('sso_app=') === -1 &&
                  q.indexOf('force_login=') === -1 &&
                  q.indexOf('logged_out=') === -1) {
                location.replace('/launcher');
              }
            } catch (e) {}
          } catch (e) {}
        })();
        """
    }

    private func setupKeyboardHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillChange(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide(_:)),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
    }

    @objc private func keyboardWillChange(_ notification: Notification) {
        guard
            let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
            let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
        else { return }

        let keyboardInView = view.convert(frame, from: nil)
        let overlap = max(0, view.bounds.maxY - keyboardInView.minY)
        webViewBottomConstraint.constant = -overlap

        UIView.animate(withDuration: duration) {
            self.view.layoutIfNeeded()
        }
        // Keep focused field visible above the keyboard
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            self?.webView.evaluateJavaScript(
                """
                (function(){
                  var el = document.activeElement;
                  if (!el) return;
                  try { el.scrollIntoView({block:'center', inline:'nearest', behavior:'smooth'}); } catch(e) {
                    try { el.scrollIntoView(true); } catch(e2) {}
                  }
                })();
                """,
                completionHandler: nil
            )
        }
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        let duration = (notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        webViewBottomConstraint.constant = 0
        UIView.animate(withDuration: duration) {
            self.view.layoutIfNeeded()
        }
    }

    // Lock pinch-zoom (iOS often zooms inputs < 16px and breaks the layout).
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }

    private func setupCloseBar() {
        closeBar = UIView()
        closeBar.translatesAutoresizingMaskIntoConstraints = false
        closeBar.isHidden = true
        closeBar.isUserInteractionEnabled = true
        closeBar.backgroundColor = UIColor(red: 0.925, green: 0.992, blue: 0.961, alpha: 1)
        closeBar.layer.shadowColor = UIColor.black.cgColor
        closeBar.layer.shadowOpacity = 0.08
        closeBar.layer.shadowOffset = CGSize(width: 0, height: 2)
        closeBar.layer.shadowRadius = 4
        view.addSubview(closeBar)

        closeBarHeightConstraint = closeBar.heightAnchor.constraint(equalToConstant: 56)
        NSLayoutConstraint.activate([
            closeBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            closeBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            closeBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            closeBarHeightConstraint,
        ])

        webViewTopToCloseBar = webView.topAnchor.constraint(equalTo: closeBar.bottomAnchor)

        backButton = makeChipButton()
        refreshButton = makeChipButton()
        closeBar.addSubview(backButton)
        closeBar.addSubview(refreshButton)

        let backIconCircle = UIView()
        backIconCircle.translatesAutoresizingMaskIntoConstraints = false
        backIconCircle.isUserInteractionEnabled = false
        backIconCircle.backgroundColor = UIColor(red: 0.82, green: 0.98, blue: 0.90, alpha: 1)
        backIconCircle.layer.cornerRadius = 18

        let backIcon = UIImageView(image: UIImage(systemName: "chevron.left"))
        backIcon.translatesAutoresizingMaskIntoConstraints = false
        backIcon.isUserInteractionEnabled = false
        backIcon.tintColor = UIColor(red: 0.024, green: 0.373, blue: 0.275, alpha: 1) // #065F46
        backIcon.contentMode = .scaleAspectFit

        brandTitle = UILabel()
        brandTitle.translatesAutoresizingMaskIntoConstraints = false
        brandTitle.isUserInteractionEnabled = false
        brandTitle.text = "Back to RefexOne App"
        brandTitle.font = .systemFont(ofSize: 14, weight: .bold)
        brandTitle.textColor = UIColor(red: 0.024, green: 0.373, blue: 0.275, alpha: 1)
        brandTitle.lineBreakMode = .byTruncatingTail

        subtitleLabel = UILabel()
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        subtitleLabel.isUserInteractionEnabled = false
        subtitleLabel.text = "Opening application…"
        subtitleLabel.font = .systemFont(ofSize: 11, weight: .regular)
        subtitleLabel.textColor = UIColor(red: 0.392, green: 0.455, blue: 0.545, alpha: 1) // #64748B
        subtitleLabel.isHidden = true

        let textStack = UIStackView(arrangedSubviews: [brandTitle, subtitleLabel])
        textStack.translatesAutoresizingMaskIntoConstraints = false
        textStack.isUserInteractionEnabled = false
        textStack.axis = .vertical
        textStack.spacing = 1

        backButton.addSubview(backIconCircle)
        backIconCircle.addSubview(backIcon)
        backButton.addSubview(textStack)

        let refreshIcon = UIImageView(image: UIImage(systemName: "arrow.clockwise"))
        refreshIcon.translatesAutoresizingMaskIntoConstraints = false
        refreshIcon.isUserInteractionEnabled = false
        refreshIcon.tintColor = UIColor(red: 0.016, green: 0.471, blue: 0.341, alpha: 1) // #047857
        refreshIcon.contentMode = .scaleAspectFit

        let refreshLabel = UILabel()
        refreshLabel.translatesAutoresizingMaskIntoConstraints = false
        refreshLabel.isUserInteractionEnabled = false
        refreshLabel.text = "Refresh"
        refreshLabel.font = .systemFont(ofSize: 13, weight: .bold)
        refreshLabel.textColor = UIColor(red: 0.016, green: 0.471, blue: 0.341, alpha: 1)

        refreshButton.addSubview(refreshIcon)
        refreshButton.addSubview(refreshLabel)

        NSLayoutConstraint.activate([
            backButton.leadingAnchor.constraint(equalTo: closeBar.leadingAnchor, constant: 10),
            backButton.centerYAnchor.constraint(equalTo: closeBar.centerYAnchor),
            backButton.heightAnchor.constraint(equalToConstant: 44),

            refreshButton.leadingAnchor.constraint(equalTo: backButton.trailingAnchor, constant: 8),
            refreshButton.trailingAnchor.constraint(equalTo: closeBar.trailingAnchor, constant: -10),
            refreshButton.centerYAnchor.constraint(equalTo: closeBar.centerYAnchor),
            refreshButton.heightAnchor.constraint(equalToConstant: 44),
            refreshButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 96),

            backIconCircle.leadingAnchor.constraint(equalTo: backButton.leadingAnchor, constant: 4),
            backIconCircle.centerYAnchor.constraint(equalTo: backButton.centerYAnchor),
            backIconCircle.widthAnchor.constraint(equalToConstant: 36),
            backIconCircle.heightAnchor.constraint(equalToConstant: 36),

            backIcon.centerXAnchor.constraint(equalTo: backIconCircle.centerXAnchor),
            backIcon.centerYAnchor.constraint(equalTo: backIconCircle.centerYAnchor),
            backIcon.widthAnchor.constraint(equalToConstant: 16),
            backIcon.heightAnchor.constraint(equalToConstant: 16),

            textStack.leadingAnchor.constraint(equalTo: backIconCircle.trailingAnchor, constant: 8),
            textStack.trailingAnchor.constraint(equalTo: backButton.trailingAnchor, constant: -12),
            textStack.centerYAnchor.constraint(equalTo: backButton.centerYAnchor),

            refreshIcon.leadingAnchor.constraint(equalTo: refreshButton.leadingAnchor, constant: 10),
            refreshIcon.centerYAnchor.constraint(equalTo: refreshButton.centerYAnchor),
            refreshIcon.widthAnchor.constraint(equalToConstant: 18),
            refreshIcon.heightAnchor.constraint(equalToConstant: 18),

            refreshLabel.leadingAnchor.constraint(equalTo: refreshIcon.trailingAnchor, constant: 6),
            refreshLabel.trailingAnchor.constraint(equalTo: refreshButton.trailingAnchor, constant: -12),
            refreshLabel.centerYAnchor.constraint(equalTo: refreshButton.centerYAnchor),
        ])

        backButton.addTarget(self, action: #selector(backTapped), for: .touchUpInside)
        refreshButton.addTarget(self, action: #selector(refreshTapped), for: .touchUpInside)
    }

    private func makeChipButton() -> UIButton {
        let chip = UIButton(type: .custom)
        chip.translatesAutoresizingMaskIntoConstraints = false
        chip.backgroundColor = UIColor.white.withAlphaComponent(0.95)
        chip.layer.cornerRadius = 14
        chip.layer.borderWidth = 1
        chip.layer.borderColor = UIColor(red: 0.82, green: 0.94, blue: 0.88, alpha: 1).cgColor
        chip.adjustsImageWhenHighlighted = false
        chip.addTarget(self, action: #selector(chipTouchDown(_:)), for: .touchDown)
        chip.addTarget(self, action: #selector(chipTouchUp(_:)), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        return chip
    }

    @objc private func chipTouchDown(_ sender: UIButton) {
        sender.alpha = 0.65
    }

    @objc private func chipTouchUp(_ sender: UIButton) {
        sender.alpha = 1
    }

    private func setupPageLoader() {
        pageLoader = UIView()
        pageLoader.translatesAutoresizingMaskIntoConstraints = false
        pageLoader.backgroundColor = UIColor(red: 0.973, green: 0.980, blue: 0.988, alpha: 1) // #F8FAFC
        pageLoader.isHidden = true

        let spinner = UIActivityIndicatorView(style: .large)
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = UIColor(red: 0.020, green: 0.588, blue: 0.412, alpha: 1) // #059669
        spinner.startAnimating()

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Refreshing…"
        label.font = .systemFont(ofSize: 14, weight: .bold)
        label.textColor = UIColor(red: 0.016, green: 0.471, blue: 0.341, alpha: 1)

        let stack = UIStackView(arrangedSubviews: [spinner, label])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14

        pageLoader.addSubview(stack)
        view.addSubview(pageLoader)

        NSLayoutConstraint.activate([
            pageLoader.topAnchor.constraint(equalTo: webView.topAnchor),
            pageLoader.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            pageLoader.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            pageLoader.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: pageLoader.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: pageLoader.centerYAnchor),
        ])
    }

    private func loadMainApp() {
        if let url = URL(string: appURL) {
            webView.load(URLRequest(url: url))
        }
    }

    // MARK: - Actions

    @objc private func backTapped() {
        // Immediate feedback — do not wait for Kissflow page / cookie work.
        returnToLauncher()
    }

    @objc private func refreshTapped() {
        guard !pageRefreshPending, !isReturningToLauncher else { return }
        showPageLoader()
        webView.reload()
    }

    // MARK: - App update (same card UX as Android)

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
                let current = json["current_build"] as? Int
                let latest = json["latest_build"] as? Int

                if !force {
                    completion()
                } else {
                    self.forceUpdateBlocking = true
                }

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
        badge.textColor = force
            ? UIColor(red: 0.73, green: 0.11, blue: 0.11, alpha: 1)
            : UIColor(red: 0.02, green: 0.47, blue: 0.34, alpha: 1)
        badge.backgroundColor = force
            ? UIColor(red: 0.98, green: 0.95, blue: 0.95, alpha: 1)
            : UIColor(red: 0.93, green: 0.99, blue: 0.96, alpha: 1)

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
            laterBtn.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24),
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

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if forceUpdateBlocking {
            checkForAppUpdate { }
        }
    }

    // MARK: - Navigation handling (Android parity)

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let target = navigationAction.request.url?.absoluteString
        let current = webView.url?.absoluteString

        // While returning home, block SSO/login history from winning the race.
        if isReturningToLauncher {
            if let target, isRefexOneLauncherUrl(target) || target.hasPrefix(launcherURL) {
                decisionHandler(.allow)
                return
            }
            if let target, isOidcResumeOrAuthorizeUrl(target) || isRefexOneLoginUrl(target) {
                decisionHandler(.cancel)
                return
            }
        }

        // Match Android onBackPressed for swipe / history back
        if navigationAction.navigationType == .backForward {
            // Kissflow → RefexOne/SAML history: go home (don't replay SSO)
            if isKissflowUrl(current) {
                if isRefexOneUrl(target) || (target?.contains("/api/saml/") == true) {
                    decisionHandler(.cancel)
                    returnToLauncher()
                    return
                }
            }
            // Feast / RefexQR (external) → RefexOne login/OIDC/SAML history: go home
            // (replaying oidc_redirect was logging users out into the login form)
            if isExternalInAppUrl(current) {
                if isRefexOneUrl(target) || isOidcResumeOrAuthorizeUrl(target) || (target?.contains("/api/saml/") == true) {
                    decisionHandler(.cancel)
                    returnToLauncher()
                    return
                }
            }
            // After toolbar ←, never swipe back from RefexOne into Kissflow / OIDC apps
            if isRefexOneUrl(current), let target, !isRefexOneUrl(target) {
                decisionHandler(.cancel)
                return
            }
        }

        if let target {
            captureModuleFromUrl(target)
        }
        // Keep Kissflow + SAML + RefexOne + OIDC apps inside the WebView
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        let url = webView.url?.absoluteString
        handleNavigationStart(url)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        let url = webView.url?.absoluteString
        handleNavigationStart(url)
        updateCloseBar(url: url)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let url = webView.url?.absoluteString
        if isReturningToLauncher, isRefexOneLauncherUrl(url) {
            isReturningToLauncher = false
        }
        scheduleHidePageLoader()
        captureModuleFromUrl(url)

        clearWebHistoryIfNeeded(url: url)
        checkSessionStorageModule(url: url) { [weak self] in
            guard let self = self else { return }
            self.maybeRedirectToPendingModule(url: url)
            self.updateCloseBar(url: url)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // window.open → same WebView (Android keeps SSO in-app)
        if navigationAction.request.url != nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    private func handleNavigationStart(_ url: String?) {
        if isReturningToLauncher {
            if isRefexOneLauncherUrl(url) {
                isReturningToLauncher = false
                pendingHistoryClear = true
                updateCloseBar(url: url)
                return
            }
            // Feast/QR sometimes redirects to /login during back — keep session, force home.
            if isRefexOneLoginUrl(url) || isOidcResumeOrAuthorizeUrl(url) {
                if let launcher = URL(string: launcherURL) {
                    webView.load(URLRequest(url: launcher))
                }
                return
            }
            updateCloseBar(url: url)
            return
        }

        captureModuleFromUrl(url)
        if isSamlCompleteUrl(url) {
            clearKissflowCookiesOnly()
        } else if isRefexOneLoginUrl(url) {
            bounceAuthenticatedUserOffLogin(url: url)
        } else if isKissflowLoginUrl(url) {
            returnToLauncher()
        }
        updateCloseBar(url: url)
    }

    // MARK: - Module redirect

    private func captureModuleFromUrl(_ url: String?) {
        guard let url, url.contains("/api/saml/") else { return }
        guard let components = URLComponents(string: url) else { return }
        if let module = components.queryItems?.first(where: { $0.name == "mobile_module" })?.value,
           !module.isEmpty {
            pendingModuleUrl = module
        }
    }

    private func checkSessionStorageModule(url: String?, then: @escaping () -> Void) {
        guard let url, url.contains(kissflowDomain) else {
            then()
            return
        }
        webView.evaluateJavaScript(
            "(function(){try{return sessionStorage.getItem('refexone_pending_module')||'';}catch(e){return ''}})()"
        ) { [weak self] result, _ in
            let module = self?.unwrapJsString(result as? String)
            if let module, !module.isEmpty,
               self?.pendingModuleUrl == nil || self?.pendingModuleUrl?.isEmpty == true {
                self?.pendingModuleUrl = module
            }
            then()
        }
    }

    private func unwrapJsString(_ value: String?) -> String? {
        guard var s = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !s.isEmpty, s != "null", s != "\"\"" else { return nil }
        if s.hasPrefix("\""), s.hasSuffix("\""), s.count >= 2 {
            s = String(s.dropFirst().dropLast())
        }
        return s.replacingOccurrences(of: "\\/", with: "/")
    }

    private func maybeRedirectToPendingModule(url: String?) {
        guard !isReturningToLauncher else { return }
        guard let pending = pendingModuleUrl, !pending.isEmpty, let url else { return }
        guard isKissflowReadyForModuleRedirect(url) else { return }

        if isModuleUrl(current: url, target: pending) {
            pendingModuleUrl = nil
            moduleRedirectScheduled = false
            webView.evaluateJavaScript(
                "try{sessionStorage.removeItem('refexone_pending_module')}catch(e){}",
                completionHandler: nil
            )
            return
        }

        guard !moduleRedirectScheduled else { return }
        moduleRedirectScheduled = true
        let target = pending
        moduleRedirectWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            self.moduleRedirectScheduled = false
            guard self.pendingModuleUrl == target, let moduleURL = URL(string: target) else { return }
            self.webView.load(URLRequest(url: moduleURL))
        }
        moduleRedirectWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + moduleRedirectDelayMs, execute: work)
    }

    private func isKissflowReadyForModuleRedirect(_ url: String?) -> Bool {
        guard let url, url.contains(kissflowDomain) else { return false }
        return !url.contains(samlAcsPath) && !url.contains(samlLoginPath)
    }

    private func isModuleUrl(current: String?, target: String?) -> Bool {
        guard let current, let target,
              let cur = URL(string: current), let tgt = URL(string: target) else {
            return current?.contains(target ?? "") == true
        }
        let curPath = cur.path
        let tgtPath = tgt.path
        return curPath == tgtPath || curPath.hasPrefix(tgtPath)
    }

    // MARK: - Session / launcher

    private func returnToLauncher() {
        guard !isReturningToLauncher else { return }
        isReturningToLauncher = true

        let current = webView.url?.absoluteString
        pendingModuleUrl = nil
        moduleRedirectScheduled = false
        pendingHistoryClear = true
        moduleRedirectWorkItem?.cancel()
        moduleRedirectWorkItem = nil
        hidePageLoader()
        setCloseBarMode(.hidden, url: nil)

        // Stop in-flight SSO navigation first so back feels instant.
        webView.stopLoading()

        // Only clear Kissflow cookies when leaving Kissflow.
        if isKissflowUrl(current) {
            clearKissflowSession()
        } else {
            pendingModuleUrl = nil
            moduleRedirectScheduled = false
        }

        if let url = URL(string: launcherURL) {
            webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            self?.isReturningToLauncher = false
        }
    }

    private func bounceAuthenticatedUserOffLogin(url: String?) {
        guard let url, isRefexOneLoginUrl(url) else { return }
        if url.contains("force_login=1") || url.contains("logged_out=1") { return }
        if url.contains("oidc_redirect=") || url.contains("sso_app=") { return }

        webView.evaluateJavaScript(
            "(function(){try{return localStorage.getItem('iam_token')||'';}catch(e){return ''}})()"
        ) { [weak self] result, _ in
            guard let self = self else { return }
            let token = self.unwrapJsString(result as? String)
            if let token, !token.isEmpty, let launcher = URL(string: self.launcherURL) {
                self.pendingModuleUrl = nil
                self.moduleRedirectScheduled = false
                self.pendingHistoryClear = true
                self.setCloseBarMode(.hidden, url: nil)
                self.webView.load(URLRequest(url: launcher))
            }
        }
    }

    private func isKissflowLoginUrl(_ url: String?) -> Bool {
        guard let url, url.contains(kissflowDomain) else { return false }
        if url.contains(samlAcsPath) || url.contains("/saml") { return false }
        guard let path = URL(string: url)?.path.lowercased() else {
            return url.contains(samlLoginPath)
        }
        return path.contains("/view/login") || path == "/login" || path.hasSuffix("/login")
    }

    private func isSamlCompleteUrl(_ url: String?) -> Bool {
        guard let url else { return false }
        return url.contains("/api/saml/") && url.contains("/complete")
    }

    private func isRefexOneLoginUrl(_ url: String?) -> Bool {
        guard isRefexOneUrl(url), let path = URL(string: url ?? "")?.path else { return false }
        return path.hasPrefix("/login")
    }

    /// Feast / RefexQR OIDC authorize + login resume URLs.
    private func isOidcResumeOrAuthorizeUrl(_ url: String?) -> Bool {
        guard let url else { return false }
        if url.contains("oidc_redirect=") { return true }
        if url.contains("/api/oidc/") { return true }
        if url.contains("/oidc/") && url.contains("/authorize") { return true }
        return false
    }

    /// In-app external host (Feast, QR, etc.) — not RefexOne and not plain about:blank.
    private func isExternalInAppUrl(_ url: String?) -> Bool {
        guard let url, !url.isEmpty, !url.hasPrefix("about:") else { return false }
        if isRefexOneUrl(url) || isKissflowUrl(url) { return false }
        return URL(string: url)?.host != nil
    }

    private func clearKissflowCookiesOnly() {
        let store = WKWebsiteDataStore.default().httpCookieStore
        store.getAllCookies { [weak self] cookies in
            guard let self = self else { return }
            for cookie in cookies where cookie.domain.contains(self.kissflowDomain) {
                store.delete(cookie)
            }
        }
    }

    private func clearKissflowSession() {
        pendingModuleUrl = nil
        moduleRedirectScheduled = false
        clearKissflowCookiesOnly()
        webView.evaluateJavaScript(
            "try{sessionStorage.removeItem('refexone_pending_module');}catch(e){}",
            completionHandler: nil
        )
    }

    private func clearAppSession() {
        pendingModuleUrl = nil
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast) { [weak self] in
            self?.webView.evaluateJavaScript(
                "try{localStorage.clear();sessionStorage.clear();}catch(e){}",
                completionHandler: nil
            )
        }
        webView.evaluateJavaScript(
            "try{localStorage.clear();sessionStorage.clear();}catch(e){}",
            completionHandler: nil
        )
    }

    private func clearWebHistoryIfNeeded(url: String?) {
        guard pendingHistoryClear, isRefexOneLauncherUrl(url) else { return }
        pendingHistoryClear = false
        // WKWebView has no clearHistory; reload launcher after back-stack reset by loading anew
        // Android clears history here; iOS gesture back is constrained in decidePolicy / goBack helpers.
    }

    // MARK: - URL helpers

    private func isRefexOneUrl(_ url: String?) -> Bool {
        guard let host = URL(string: url ?? "")?.host else { return false }
        return host.contains(appHost)
    }

    private func isRefexOneLauncherUrl(_ url: String?) -> Bool {
        guard isRefexOneUrl(url) else { return false }
        let path = URL(string: url ?? "")?.path ?? ""
        if path.isEmpty || path == "/" { return true }
        return path.hasPrefix("/launcher")
    }

    private func isKissflowUrl(_ url: String?) -> Bool {
        guard let host = URL(string: url ?? "")?.host else {
            return url?.contains(kissflowDomain) == true
        }
        return host.contains(kissflowDomain)
    }

    // MARK: - Close bar

    private func updateCloseBar(url: String?) {
        setCloseBarMode(getCloseBarMode(url), url: url)
    }

    private func getCloseBarMode(_ url: String?) -> CloseBarMode {
        guard let url, !url.isEmpty else { return .hidden }
        if isKissflowUrl(url), isKissflowReadyForModuleRedirect(url) {
            return .compact
        }
        guard let host = URL(string: url)?.host else { return .hidden }
        if host.contains(appHost) {
            let path = URL(string: url)?.path ?? ""
            return path.contains("/api/saml/") ? .full : .hidden
        }
        return .full
    }

    private func setCloseBarMode(_ mode: CloseBarMode, url: String?) {
        currentCloseBarMode = mode
        applySystemBarPalette(mode)

        guard closeBar != nil else { return }

        if mode == .hidden {
            closeBar.isHidden = true
            webViewTopToCloseBar.isActive = false
            webViewTopToSafeArea.isActive = true
            return
        }

        closeBar.isHidden = false
        view.bringSubviewToFront(closeBar)
        webViewTopToSafeArea.isActive = false
        webViewTopToCloseBar.isActive = true
        closeBarHeightConstraint.constant = mode == .compact ? 56 : 64
        backButton.isEnabled = true
        refreshButton.isEnabled = !pageRefreshPending

        if mode == .compact {
            closeBar.backgroundColor = UIColor(red: 0.925, green: 0.992, blue: 0.961, alpha: 1)
            subtitleLabel.isHidden = true
            brandTitle.text = "Back to RefexOne App"
            brandTitle.textColor = UIColor(red: 0.024, green: 0.373, blue: 0.275, alpha: 1)
            brandTitle.font = .systemFont(ofSize: 14, weight: .bold)
            refreshButton.isHidden = false
        } else {
            closeBar.backgroundColor = .white
            subtitleLabel.isHidden = false
            brandTitle.text = "RefexOne"
            brandTitle.textColor = UIColor(red: 0.059, green: 0.090, blue: 0.165, alpha: 1) // #0F172A
            brandTitle.font = .systemFont(ofSize: 16, weight: .bold)
            if let url {
                subtitleLabel.text = resolveSubtitle(url)
            }
            refreshButton.isHidden = false
        }
    }

    private func applySystemBarPalette(_ mode: CloseBarMode) {
        let emerald50 = UIColor(red: 0.925, green: 0.992, blue: 0.961, alpha: 1)
        view.backgroundColor = mode == .full ? .white : emerald50
    }

    private func resolveSubtitle(_ url: String) -> String {
        if url.contains("/api/saml/") {
            return "Signing in securely…"
        }
        if let path = URL(string: url)?.path, path.contains("/application/") {
            if let range = path.range(of: "/application/") {
                var segment = String(path[range.upperBound...])
                if let slash = segment.firstIndex(of: "/") {
                    segment = String(segment[..<slash])
                }
                return segment.replacingOccurrences(of: "_", with: " ")
            }
        }
        if isKissflowUrl(url) {
            return "Kissflow"
        }
        return "Application"
    }

    // MARK: - Page loader

    private func showPageLoader() {
        pageRefreshPending = true
        hideLoaderWorkItem?.cancel()
        pageLoader.isHidden = false
        view.bringSubviewToFront(pageLoader)
        // Keep close bar above the loader so Back stays tappable during refresh.
        if closeBar != nil, !closeBar.isHidden {
            view.bringSubviewToFront(closeBar)
        }
        refreshButton.isEnabled = false
        refreshButton.alpha = 0.5
    }

    private func scheduleHidePageLoader() {
        guard pageRefreshPending else { return }
        hideLoaderWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.hidePageLoader() }
        hideLoaderWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }

    private func hidePageLoader() {
        pageRefreshPending = false
        hideLoaderWorkItem = nil
        pageLoader.isHidden = true
        refreshButton.isEnabled = true
        refreshButton.alpha = 1
    }

    // MARK: - JS bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == bridgeName,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            switch action {
            case "setPendingModule":
                if let url = body["url"] as? String, !url.isEmpty {
                    self.pendingModuleUrl = url
                }
            case "clearKissflowSession":
                self.clearKissflowSession()
            case "clearAppSession":
                self.clearAppSession()
            default:
                break
            }
        }
    }
}
