import SwiftUI

// Identity, notification preferences (live against /api/settings), account
// actions, sign out. Mirrors the web /settings page.
struct SettingsView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss

    @State private var api: APIClient?
    @State private var me: Me?
    @State private var prefs: MemberSettings?
    @State private var notice: String?
    @State private var busy = false

    private let frequencies = [
        ("immediate", "Immediately"),
        ("daily", "Daily"),
        ("weekly", "Weekly"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    identityCard

                    if let prefs {
                        preferencesCard(prefs)
                    }

                    accountCard

                    Button("Sign out") {
                        Task {
                            await auth.signOut()
                            dismiss()
                        }
                    }
                    .buttonStyle(SoftButtonStyle())

                    if let notice {
                        Text(notice)
                            .font(.system(size: 13))
                            .foregroundStyle(Color.sage600)
                            .transition(.opacity)
                    }
                }
                .padding(20)
            }
            .background(Color.mist50.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Color.sage600)
                }
            }
        }
        .task {
            let client = APIClient(auth: auth)
            api = client
            me = try? await client.get("/api/me")
            prefs = try? await client.get("/api/settings")
        }
    }

    private var identityCard: some View {
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
    }

    private func preferencesCard(_ current: MemberSettings) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Notifications")
                .font(.display(18))
                .foregroundStyle(Color.ink800)

            Toggle(isOn: Binding(
                get: { current.notifyPush },
                set: { newValue in Task { await save(notifyPush: newValue) } }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Push notifications")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.ink700)
                    Text("An instant tap when a new request arrives")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.ink300)
                }
            }
            .tint(Color.sage500)

            Toggle(isOn: Binding(
                get: { current.notifyNewRequests },
                set: { newValue in Task { await save(notifyNewRequests: newValue) } }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Email me about new requests")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.ink700)
                    Text("Sent to \(me?.email ?? "your email")")
                        .font(.system(size: 12))
                        .foregroundStyle(Color.ink300)
                }
            }
            .tint(Color.sage500)

            if current.notifyNewRequests {
                HStack(spacing: 4) {
                    ForEach(frequencies, id: \.0) { value, label in
                        Button {
                            Task { await save(frequency: value) }
                        } label: {
                            Text(label)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(current.notifyFrequency == value ? Color.ink700 : Color.ink400)
                                .padding(.vertical, 6)
                                .frame(maxWidth: .infinity)
                                .background(
                                    current.notifyFrequency == value ? Color.white : Color.clear,
                                    in: Capsule()
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(4)
                .background(Color.mist100, in: Capsule())
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Account")
                .font(.display(18))
                .foregroundStyle(Color.ink800)
            Text("We'll email you a link to choose a new password.")
                .font(.system(size: 13))
                .foregroundStyle(Color.ink400)
            Button(busy ? "Sending…" : "Send password reset email") {
                Task { await resetPassword() }
            }
            .buttonStyle(SoftButtonStyle())
            .disabled(busy)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func save(
        notifyNewRequests: Bool? = nil,
        frequency: String? = nil,
        notifyPush: Bool? = nil
    ) async {
        guard let api, var updated = prefs else { return }
        let previous = prefs
        if let notifyNewRequests { updated.notifyNewRequests = notifyNewRequests }
        if let frequency { updated.notifyFrequency = frequency }
        if let notifyPush { updated.notifyPush = notifyPush }
        prefs = updated

        var body: [String: AnyEncodableValue] = [:]
        if let notifyNewRequests { body["notify_new_requests"] = .bool(notifyNewRequests) }
        if let frequency { body["notify_frequency"] = .string(frequency) }
        if let notifyPush { body["notify_push"] = .bool(notifyPush) }

        do {
            let _: SimpleSuccess = try await api.patch("/api/settings", body: body)
            flash("Saved")
        } catch {
            prefs = previous
            flash("Could not save — please try again")
        }
    }

    private func resetPassword() async {
        guard let api else { return }
        busy = true
        defer { busy = false }
        do {
            let _: SimpleSuccess = try await api.post("/api/settings/reset-password")
            flash("Reset link sent — check your email")
        } catch {
            flash("Could not send the reset email")
        }
    }

    private func flash(_ text: String) {
        withAnimation(.easeOut(duration: 0.3)) { notice = text }
        Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation(.easeOut(duration: 0.3)) { notice = nil }
        }
    }
}

// A tiny heterogeneous-value encoder for PATCH bodies with mixed types.
enum AnyEncodableValue: Encodable {
    case bool(Bool)
    case string(String)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .bool(let v): try container.encode(v)
        case .string(let v): try container.encode(v)
        }
    }
}
