import SwiftUI

@main
struct PrayerTeamApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView(appDelegate: appDelegate)
                .environment(auth)
                .tint(.sage600)
                .task { await auth.start() }
        }
    }
}

struct RootView: View {
    let appDelegate: AppDelegate
    @Environment(AuthStore.self) private var auth

    var body: some View {
        switch auth.state {
        case .loading:
            ZStack {
                Color.mist50.ignoresSafeArea()
                ProgressView().tint(Color.sage500)
            }
        case .signedOut:
            LoginView()
        case .signedIn:
            FeedView()
                .onAppear { PushManager.enable(appDelegate: appDelegate, auth: auth) }
        }
    }
}
