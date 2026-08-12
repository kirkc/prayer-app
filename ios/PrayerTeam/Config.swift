import Foundation

// Deployment endpoints. The Supabase URL + anon key are public by design
// (they ship in the web bundle too); all data access is guarded by RLS and
// the Next.js API.
enum Config {
    static let supabaseURL = URL(string: "https://rlfbtodwbszvrfktvfvb.supabase.co")!
    static let supabaseAnonKey = ProcessInfo.processInfo
        .environment["SUPABASE_ANON_KEY_OVERRIDE"]
        ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZmJ0b2R3YnN6dnJma3R2ZnZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTQ3ODUsImV4cCI6MjA5OTAzMDc4NX0.QHy4qyFHGL4-vboJwbxekqQV5zagwjCIxbtCXnEyWSM"

    // The Next.js API the app talks to for everything except auth.
    // Simulator debug builds share the Mac's loopback, so they use the local
    // dev server; a physical phone can't reach the Mac's localhost, so debug
    // builds on real hardware talk to production like release builds do.
    #if DEBUG && targetEnvironment(simulator)
    static let apiBase = URL(string: ProcessInfo.processInfo
        .environment["API_BASE_OVERRIDE"] ?? "http://localhost:3005")!
    #else
    static let apiBase = URL(string: "https://prayer.redemptionseattle.org")!
    #endif

    // Where the Settings screen sends people for policy and help. Always the
    // real site, even in debug — these open in Safari, which can't reach the
    // Mac's localhost, and App Review follows them.
    static let webBase = URL(string: "https://prayer.redemptionseattle.org")!
    static let privacyURL = webBase.appending(path: "legal/privacy")
    static let termsURL = webBase.appending(path: "legal/terms")
    static let supportURL = webBase.appending(path: "support")

    // Marketing version + build, e.g. "0.3.0 (3)".
    static var versionLabel: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "—"
        let build = info?["CFBundleVersion"] as? String ?? "—"
        return "\(version) (\(build))"
    }
}
