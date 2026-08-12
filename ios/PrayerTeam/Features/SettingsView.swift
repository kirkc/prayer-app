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
    @State private var loadFailed = false
    @State private var confirmingDelete = false
    @State private var deleting = false
    @State private var testing = false
    // Kept separate from `notice`, which renders at the very bottom of the
    // sheet — below the fold on this screen. A message you can't see is worse
    // than none, so these sit under the buttons that produced them. The delete
    // refusal especially: "you are the only administrator" is the whole reason
    // nothing happened.
    @State private var testNotice: String?
    @State private var deleteNotice: String?

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

                    aboutCard

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
        .task { await load() }
    }

    // Never leave the identity card blank: a failed load says so and offers a
    // retry rather than rendering an empty white box forever.
    private func load() async {
        let client = api ?? APIClient(auth: auth)
        api = client
        loadFailed = false
        do {
            me = try await client.get("/api/me")
            prefs = try await client.get("/api/settings")
        } catch {
            loadFailed = true
        }
    }

    @ViewBuilder
    private var identityCard: some View {
        VStack(spacing: 6) {
            if let me {
                Text(me.displayName ?? me.email ?? "Signed in")
                    .font(.display(24))
                    .foregroundStyle(Color.ink800)
                Text(me.email ?? "")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.ink400)
                Text(me.org.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.sage600)
                    .padding(.vertical, 4)
                    .padding(.horizontal, 12)
                    .background(Color.sage100, in: Capsule())
            } else if loadFailed {
                Text("Couldn't load your account.")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink400)
                Button("Try again") { Task { await load() } }
                    .buttonStyle(SoftButtonStyle())
                    .padding(.top, 4)
            } else {
                ProgressView().tint(Color.sage500)
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

            Divider().overlay(Color.mist100)

            // The only way to prove the push pipeline works without waiting on
            // a real request — which is how you check a fresh TestFlight build.
            VStack(alignment: .leading, spacing: 6) {
                Button(testing ? "Sending…" : "Send a test notification") {
                    Task { await sendTest() }
                }
                .buttonStyle(SoftButtonStyle())
                .disabled(testing)
                Text(testNotice ?? "Sends one email and one push to your own devices.")
                    .font(.system(size: 12))
                    .foregroundStyle(testNotice == nil ? Color.ink300 : Color.sage600)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
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

            Divider().overlay(Color.mist100)

            Button(deleting ? "Deleting…" : "Delete my account") {
                confirmingDelete = true
            }
            .buttonStyle(SoftButtonStyle(destructive: true))
            .disabled(deleting)

            if let deleteNotice {
                Text(deleteNotice)
                    .font(.system(size: 12))
                    .foregroundStyle(Color.clay600)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
        .confirmationDialog(
            "Delete your account?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete my account", role: .destructive) {
                Task { await deleteAccount() }
            }
            Button("Keep my account", role: .cancel) {}
        } message: {
            Text("This permanently removes your name, email, notification preferences, and the record of what you've prayed for. You'll lose access to your church's requests. It can't be undone.")
        }
    }

    // App Review looks for these, and a member who wants to know what's stored
    // shouldn't have to go find the website on their own.
    private var aboutCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("About")
                .font(.display(18))
                .foregroundStyle(Color.ink800)

            Link("Privacy Policy", destination: Config.privacyURL)
            Link("Terms of Service", destination: Config.termsURL)
            Link("Support", destination: Config.supportURL)

            Text("Version \(Config.versionLabel)")
                .font(.system(size: 12))
                .foregroundStyle(Color.ink300)
                .padding(.top, 4)
        }
        .font(.system(size: 14))
        .foregroundStyle(Color.sage600)
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

    // Held longer than the usual flash: this one is a diagnostic you read, not
    // a "Saved" you glance at.
    private func sendTest() async {
        guard let api else { return }
        testing = true
        defer { testing = false }
        let message: String
        do {
            let result: TestNotificationResult = try await api.post("/api/settings/test")
            message = result.summary
        } catch {
            message = (error as? APIError)?.message ?? "Could not send the test notification."
        }
        withAnimation(.easeOut(duration: 0.3)) { testNotice = message }
        Task {
            try? await Task.sleep(for: .seconds(10))
            withAnimation(.easeOut(duration: 0.3)) { testNotice = nil }
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

    // The server does the work and the guarding (a church's last admin can't
    // leave it stranded); the app just relays whatever it says.
    private func deleteAccount() async {
        guard let api else { return }
        deleting = true
        withAnimation(.easeOut(duration: 0.3)) { deleteNotice = nil }
        do {
            let _: SimpleSuccess = try await api.delete("/api/me")
            await auth.signOut()
            dismiss()
        } catch {
            deleting = false
            let message = (error as? APIError)?.message ?? "Could not delete your account."
            // No auto-dismiss: the refusal tells you what to do next.
            withAnimation(.easeOut(duration: 0.3)) { deleteNotice = message }
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
