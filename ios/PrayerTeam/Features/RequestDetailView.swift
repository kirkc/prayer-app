import SwiftUI

// One request in full: the complete text, pray toggle, triage, and — when the
// requester left a number and this church has texting — the Respond sheet.
struct RequestDetailView: View {
    let store: FeedStore
    let requestId: String
    // Set when arriving from a card's reply bubble: open the sheet straight
    // away so the member lands on a keyboard, not another button.
    var autoRespond: Bool = false

    @Environment(\.dismiss) private var dismiss
    @State private var showRespond = false
    // nil until the first load; empty when there's no conversation yet.
    @State private var thread: [ThreadMessage]?
    @State private var moveError: String?
    @State private var busy = false

    private static let absolute: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f
    }()

    private static let relative: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()

    var body: some View {
        Group {
            if let prayer = store.current(requestId) {
                content(prayer)
            } else {
                // Triaged away from this list while the detail was open.
                Color.mist50.ignoresSafeArea()
                    .onAppear { dismiss() }
            }
        }
        .background(Color.mist50.ignoresSafeArea())
        .task {
            guard autoRespond else { return }
            // Let the push animation settle before presenting, or the sheet
            // fights the navigation transition.
            try? await Task.sleep(for: .milliseconds(350))
            showRespond = true
        }
        .task(id: requestId) { await loadThread() }
        .alert("Couldn't move it", isPresented: Binding(
            get: { moveError != nil },
            set: { if !$0 { moveError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(moveError ?? "")
        }
    }

    private func loadThread() async {
        if let page: ThreadPage = try? await store.api.get("/api/prayers/\(requestId)/thread") {
            thread = page.items
        }
    }

    // A reply in the thread was really a new request. Promote it, then pull
    // the feed so it shows up at the top.
    private func promote(_ message: ThreadMessage) async {
        busy = true
        defer { busy = false }
        do {
            let _: PromoteResult = try await store.api.post("/api/inbound/\(message.id)/promote")
            await loadThread()
            await store.refresh()
        } catch {
            moveError = (error as? APIError)?.message ?? "Could not make this a request."
        }
    }

    private func moveToThread(_ prayer: PrayerRequest) async {
        busy = true
        defer { busy = false }
        if let message = await store.moveToThread(prayer) {
            moveError = message
        } else {
            dismiss()
        }
    }

    private var hasConversation: Bool {
        guard let prayer = store.current(requestId) else { return false }
        return prayer.replied || (prayer.replyCount ?? 0) > 0 || !(thread?.isEmpty ?? true)
    }

    @ViewBuilder
    private func conversation(_ prayer: PrayerRequest) -> some View {
        let requester = prayer.name?.isEmpty == false ? prayer.name! : "Anonymous"
        VStack(alignment: .leading, spacing: 14) {
            Text("Conversation")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color.ink400)

            if let thread, !thread.isEmpty {
                ForEach(thread) { message in
                    if message.isReaction {
                        HStack(spacing: 8) {
                            Text(message.reactionGlyph)
                                .font(.system(size: 16))
                            Text("\(requester) · \(Self.relative.localizedString(for: message.at, relativeTo: .now))")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.ink300)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("\(message.isInbound ? requester : (message.author ?? "Prayer team")) · \(Self.relative.localizedString(for: message.at, relativeTo: .now))")
                                .font(.system(size: 12))
                                .foregroundStyle(Color.ink300)
                            Text(message.body)
                                .font(.system(size: 15))
                                .fontWeight(.light)
                                .foregroundStyle(message.isInbound ? Color.ink700 : Color.ink500)
                                .lineSpacing(4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if message.isInbound {
                                Button("Make this a request") {
                                    Task { await promote(message) }
                                }
                                .font(.system(size: 12))
                                .foregroundStyle(Color.ink300)
                                .disabled(busy)
                            }
                        }
                    }
                }
            } else if thread == nil {
                ProgressView().tint(Color.sage500)
            } else {
                Text("Nothing here yet.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.ink300)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    @ViewBuilder
    private func content(_ prayer: PrayerRequest) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(prayer.name?.isEmpty == false ? prayer.name! : "Anonymous")
                            .font(.display(22))
                            .foregroundStyle(Color.ink800)
                        Spacer()
                        Text(prayer.source == "sms" ? "via text" : "via web")
                            .font(.system(size: 12))
                            .foregroundStyle(Color.ink300)
                    }

                    Text(Self.absolute.string(from: prayer.createdAt))
                        .font(.system(size: 12))
                        .foregroundStyle(Color.ink300)

                    Text(prayer.request)
                        .font(.system(size: 16))
                        .fontWeight(.light)
                        .foregroundStyle(Color.ink700)
                        .lineSpacing(5)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    HStack(spacing: 10) {
                        if prayer.prayedCount > 0 {
                            Text(prayer.prayedCount == 1 ? "1 prayer" : "\(prayer.prayedCount) prayers")
                                .font(.system(size: 13))
                                .foregroundStyle(Color.ink400)
                        }
                        if prayer.replied {
                            Text("Replied")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Color.sage600)
                        }
                        if let count = prayer.replyCount, count > 0 {
                            Text(count == 1 ? "1 reply" : "\(count) replies")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(Color.sage600)
                        }
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()

                if hasConversation {
                    conversation(prayer)
                }

                Button {
                    Task { await store.togglePray(prayer) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: prayer.youPrayed ? "heart.fill" : "heart")
                        Text(prayer.youPrayed ? "Prayed" : "Pray for this")
                    }
                    .lineLimit(1)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(prayer.youPrayed ? AnyButtonStyle(SoftButtonStyle())
                                              : AnyButtonStyle(PrimaryButtonStyle()))

                if prayer.hasPhone && store.smsEnabled {
                    Button {
                        showRespond = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "bubble.left")
                            Text("Respond by text")
                        }
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(AnyButtonStyle(SoftButtonStyle()))
                }
            }
            .padding(16)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if prayer.status != "active" {
                        Button("Restore to active") {
                            Task { await triage(prayer, "active") }
                        }
                    }
                    if prayer.status != "archived" {
                        Button("Archive") {
                            Task { await triage(prayer, "archived") }
                        }
                    }
                    if prayer.status != "spam" {
                        Button("Mark as spam", role: .destructive) {
                            Task { await triage(prayer, "spam") }
                        }
                    }
                    if prayer.source == "sms" && prayer.hasPhone {
                        // A text back to us that the webhook took for a request.
                        Button("Move to thread") {
                            Task { await moveToThread(prayer) }
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(Color.ink400)
                }
            }
        }
        .sheet(isPresented: $showRespond, onDismiss: { Task { await loadThread() } }) {
            RespondSheet(store: store, prayer: prayer)
        }
    }

    private func triage(_ prayer: PrayerRequest, _ status: String) async {
        await store.setStatus(prayer, to: status)
        dismiss()
    }
}

// Type-erased button style so a button can swap styles by state.
struct AnyButtonStyle: ButtonStyle {
    private let make: (Configuration) -> AnyView
    init(_ style: some ButtonStyle) {
        make = { AnyView(style.makeBody(configuration: $0)) }
    }
    func makeBody(configuration: Configuration) -> some View {
        make(configuration)
    }
}

struct RespondSheet: View {
    let store: FeedStore
    let prayer: PrayerRequest

    @Environment(\.dismiss) private var dismiss
    @State private var message = ""
    @State private var sending = false
    @State private var errorMessage: String?
    @FocusState private var editorFocused: Bool

    private let limit = 1000

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                Text("Your reply is sent as a text from the church's number\(prayer.name?.isEmpty == false ? " to \(prayer.name!)" : ""). Keep it warm and personal.")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.ink400)

                TextEditor(text: $message)
                    .font(.system(size: 15))
                    .foregroundStyle(Color.ink700)
                    .scrollContentBackground(.hidden)
                    .focused($editorFocused)
                    .padding(12)
                    .frame(minHeight: 160)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.mist300, lineWidth: 1))

                HStack {
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(Color.red.opacity(0.8))
                    }
                    Spacer()
                    Text("\(message.count)/\(limit)")
                        .font(.system(size: 12))
                        .foregroundStyle(message.count > limit ? Color.red.opacity(0.8) : Color.ink300)
                }

                Button {
                    Task { await send() }
                } label: {
                    Text(sending ? "Sending…" : "Send text")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(sending || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || message.count > limit)
                .opacity(sending || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || message.count > limit ? 0.5 : 1)

                Spacer()
            }
            .padding(20)
            .background(Color.mist50.ignoresSafeArea())
            .navigationTitle("Respond")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.ink400)
                }
            }
        }
        .presentationDetents([.large])
        .task {
            // The sheet needs a beat on screen before it will take focus.
            try? await Task.sleep(for: .milliseconds(250))
            editorFocused = true
        }
    }

    private func send() async {
        sending = true
        errorMessage = nil
        defer { sending = false }
        do {
            let result: RespondResult = try await store.api.post(
                "/api/prayers/\(prayer.id)/respond",
                body: ["body": message.trimmingCharacters(in: .whitespacesAndNewlines)]
            )
            store.applyRespondResult(prayer.id, result)
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.message ?? "Could not send the text."
        }
    }
}
