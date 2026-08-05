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
    #if DEBUG
    // Simulator reaches the dev server on the host machine directly.
    static let apiBase = URL(string: ProcessInfo.processInfo
        .environment["API_BASE_OVERRIDE"] ?? "http://localhost:3005")!
    #else
    static let apiBase = URL(string: "https://prayer.redemptionseattle.org")!
    #endif
}
