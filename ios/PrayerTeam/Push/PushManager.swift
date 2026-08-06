import SwiftUI
import UserNotifications
import os.log

extension Notification.Name {
    // Posted when the member taps a push; userInfo carries request_id.
    static let pushRequestTapped = Notification.Name("pushRequestTapped")
}

// UIKit bridge: receives the APNs device token and notification taps.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var onDeviceToken: ((String) -> Void)?

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        onDeviceToken?(hex)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        os_log("[push] registration failed: %{public}@", String(describing: error))
    }

    // Show pushes as banners even while the app is open.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        if let id = response.notification.request.content.userInfo["request_id"] as? String {
            NotificationCenter.default.post(
                name: .pushRequestTapped,
                object: nil,
                userInfo: ["request_id": id]
            )
        }
    }
}

// Asks for permission, registers with APNs, and reports the token to the API.
// Called after sign-in — never before, so the permission prompt lands in a
// moment that makes sense to the member.
@MainActor
enum PushManager {
    static func enable(appDelegate: AppDelegate, auth: AuthStore) {
        UNUserNotificationCenter.current().delegate = appDelegate

        appDelegate.onDeviceToken = { token in
            os_log("[push] got device token")
            Task {
                #if DEBUG
                let environment = "sandbox"
                #else
                let environment = "production"
                #endif
                do {
                    let _: SimpleSuccess = try await APIClient(auth: auth).post(
                        "/api/devices",
                        body: ["token": token, "environment": environment]
                    )
                    os_log("[push] device registered with API")
                } catch {
                    os_log("[push] API registration failed: %{public}@", String(describing: error))
                }
            }
        }

        Task {
            do {
                let granted = try await UNUserNotificationCenter.current()
                    .requestAuthorization(options: [.alert, .sound, .badge])
                os_log("[push] permission granted: %{public}@", String(granted))
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                    os_log("[push] registerForRemoteNotifications called")
                }
            } catch {
                os_log("[push] permission request failed: %{public}@", String(describing: error))
            }
        }
    }
}
