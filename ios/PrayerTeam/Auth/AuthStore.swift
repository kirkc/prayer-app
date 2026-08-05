import Foundation
import Supabase

// Wraps supabase-swift's auth: session persistence (Keychain) and refresh are
// its job; the app only ever asks for the current access token and reacts to
// signed-in/out state.
@Observable
@MainActor
final class AuthStore {
    enum State {
        case loading
        case signedOut
        case signedIn
    }

    let client = SupabaseClient(
        supabaseURL: Config.supabaseURL,
        supabaseKey: Config.supabaseAnonKey
    )

    private(set) var state: State = .loading
    var signInError: String?
    var busy = false

    func start() async {
        // Restore any persisted session, then follow auth events.
        do {
            _ = try await client.auth.session
            state = .signedIn
        } catch {
            state = .signedOut
        }
        for await change in client.auth.authStateChanges {
            switch change.event {
            case .signedIn, .tokenRefreshed, .initialSession:
                if change.session != nil { state = .signedIn }
            case .signedOut, .userDeleted:
                state = .signedOut
            default:
                break
            }
        }
    }

    func signIn(email: String, password: String) async {
        busy = true
        signInError = nil
        defer { busy = false }
        do {
            try await client.auth.signIn(email: email, password: password)
            state = .signedIn
        } catch {
            signInError = "That email and password didn't match. Please try again."
        }
    }

    func signOut() async {
        try? await client.auth.signOut()
        state = .signedOut
    }

    // The bearer token for API calls; supabase-swift refreshes it as needed.
    func accessToken() async throws -> String {
        try await client.auth.session.accessToken
    }
}
