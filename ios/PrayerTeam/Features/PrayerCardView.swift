import SwiftUI

struct PrayerCardView: View {
    let prayer: PrayerRequest
    // True when the requester left a number AND this church has texting.
    let canReply: Bool
    let onPray: () -> Void
    let onRespond: () -> Void

    private static let relative: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(prayer.name?.isEmpty == false ? prayer.name! : "Anonymous")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.ink400)
                    .lineLimit(1)
                Text(prayer.source == "sms" ? "· via text" : "· via web")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.ink300)
                    .layoutPriority(-1)
                Spacer(minLength: 8)
                Text(Self.relative.localizedString(for: prayer.createdAt, relativeTo: .now))
                    .font(.system(size: 12))
                    .foregroundStyle(Color.ink300)
                    .lineLimit(1)
                    .fixedSize()
            }

            Text(prayer.request)
                .font(.system(size: 15))
                .fontWeight(.light)
                .foregroundStyle(Color.ink700)
                .lineSpacing(4)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 10) {
                // fixedSize keeps the label on one line no matter how
                // crowded the row gets — without it the prayer count and
                // status squeezed "Pray" into two lines.
                // Composed by hand rather than with Label: inside a List row
                // SwiftUI collapses a Label to icon-only when it feels
                // squeezed, which silently dropped the word "Prayed".
                Button {
                    onPray()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: prayer.youPrayed ? "heart.fill" : "heart")
                        Text(prayer.youPrayed ? "Prayed" : "Pray")
                    }
                    .lineLimit(1)
                }
                .buttonStyle(SoftButtonStyle(filled: !prayer.youPrayed))
                .fixedSize(horizontal: true, vertical: false)
                .layoutPriority(3)

                if prayer.prayedCount > 0 {
                    Text(prayer.prayedCount == 1
                         ? "1 prayer"
                         : "\(prayer.prayedCount) prayers")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink400)
                        .lineLimit(1)
                        .fixedSize()
                        .layoutPriority(2)
                }

                Spacer(minLength: 4)

                if prayer.replied {
                    Text("Replied")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color.sage600)
                        .lineLimit(1)
                        .layoutPriority(1)
                }

                if canReply {
                    Button {
                        onRespond()
                    } label: {
                        Image(systemName: "bubble.left")
                            .font(.system(size: 17))
                            .foregroundStyle(Color.sage600)
                            .frame(width: 34, height: 34)
                            .background(Color.sage100, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Reply by text")
                }
            }
        }
        .padding(20)
        .card()
    }
}
