import SwiftUI

// Phase 7 keeps this minimal: identity + sign out. Notification preferences
// (GET/PATCH /api/settings) arrive with the actions phase.
struct SettingsView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var me: Me?

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                VStack(spacing: 6) {
                    Text(me?.displayName ?? " ")
                        .font(.display(24))
                        .foregroundStyle(Color.ink800)
                    Text(me?.email ?? "")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink400)
                    if let org = me?.org {
                        Text(org.name)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Color.sage600)
                            .padding(.vertical, 4)
                            .padding(.horizontal, 12)
                            .background(Color.sage100, in: Capsule())
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity)
                .card()

                Button("Sign out") {
                    Task {
                        await auth.signOut()
                        dismiss()
                    }
                }
                .buttonStyle(SoftButtonStyle())

                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.mist50.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.sage600)
                }
            }
        }
        .task {
            me = try? await APIClient(auth: auth).get("/api/me")
        }
    }
}
