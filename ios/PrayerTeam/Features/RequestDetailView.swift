import SwiftUI

// One request in full: the complete text, pray toggle, triage, and — when the
// requester left a number and this church has texting — the Respond sheet.
struct RequestDetailView: View {
    let store: FeedStore
    let requestId: String

    @Environment(\.dismiss) private var dismiss
    @State private var showRespond = false

    private static let absolute: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
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
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
                .card()

                Button {
                    Task { await store.togglePray(prayer) }
                } label: {
                    Label(
                        prayer.youPrayed ? "Prayed" : "Pray for this",
                        systemImage: prayer.youPrayed ? "heart.fill" : "heart"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(prayer.youPrayed ? AnyButtonStyle(SoftButtonStyle(active: true))
                                              : AnyButtonStyle(PrimaryButtonStyle()))

                if prayer.hasPhone && store.smsEnabled {
                    Button {
                        showRespond = true
                    } label: {
                        Label("Respond by text", systemImage: "bubble.left")
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
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .foregroundStyle(Color.ink400)
                }
            }
        }
        .sheet(isPresented: $showRespond) {
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
        .presentationDetents([.medium, .large])
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
