import SwiftUI

// The web app's "quiet spa" design system (app/globals.css), ported.
// Sage is the single accent; mist is the canvas; ink is text.
// Everything else is white and air.

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }

    static let sage50 = Color(hex: 0xF3F7F5)
    static let sage100 = Color(hex: 0xE4ECE9)
    static let sage200 = Color(hex: 0xCBDAD4)
    static let sage300 = Color(hex: 0xA8C0B8)
    static let sage400 = Color(hex: 0x82A399)
    static let sage500 = Color(hex: 0x64887E)
    static let sage600 = Color(hex: 0x4F6F66)
    static let sage700 = Color(hex: 0x415A53)

    static let mist50 = Color(hex: 0xF7FAFA)
    static let mist100 = Color(hex: 0xEEF3F3)
    static let mist200 = Color(hex: 0xE0E8E8)
    static let mist300 = Color(hex: 0xC9D6D6)

    // Destructive actions. A muted clay rather than system red — it has to
    // read as "careful" without shouting across a calm palette.
    static let clay100 = Color(hex: 0xF3E7E4)
    static let clay600 = Color(hex: 0x9C5F52)

    static let ink300 = Color(hex: 0xA3B1B5)
    static let ink400 = Color(hex: 0x81959B)
    static let ink500 = Color(hex: 0x64787F)
    static let ink600 = Color(hex: 0x4C5E66)
    static let ink700 = Color(hex: 0x39484F)
    static let ink800 = Color(hex: 0x2A363C)
}

extension Font {
    // Fraunces (OFL), bundled — the web's display face. Font.custom falls
    // back to the system face if the font ever fails to register, so this
    // degrades to New York rather than breaking.
    static func display(_ size: CGFloat, weight: Font.Weight = .light) -> Font {
        let name: String
        switch weight {
        case .medium: name = "Fraunces-Medium"
        case .regular: name = "Fraunces-Regular"
        default: name = "Fraunces-Light"
        }
        return .custom(name, size: size)
    }
}

// The web's .card: white, hairline mist border, 24pt radius, soft layered
// shadow.
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.mist200, lineWidth: 1)
            )
            .shadow(color: Color.ink800.opacity(0.03), radius: 1, y: 1)
            .shadow(color: Color.ink800.opacity(0.06), radius: 12, y: 8)
    }
}

// The web's "rise" entrance: fade + 10pt lift with the signature easing
// curve, staggered per card.
struct RiseIn: ViewModifier {
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 10)
            .onAppear {
                withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.6).delay(delay)) {
                    shown = true
                }
            }
    }
}

// The web's .input: white, 16pt radius, hairline mist border.
struct FieldBox: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.mist300, lineWidth: 1))
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }
    func fieldBox() -> some View { modifier(FieldBox()) }
    func riseIn(delay: Double = 0) -> some View { modifier(RiseIn(delay: delay)) }
}

// Pill buttons, matching .btn-primary / .btn-soft.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(.white)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(Color.sage600, in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

// `filled` is the call-to-action state: solid sage, white text. The pale
// variant reads as "already done" — so an un-prayed request shows the filled
// button (do this) and a prayed one goes quiet.
struct SoftButtonStyle: ButtonStyle {
    var filled = false
    // Same soft capsule, clay instead of sage. The style sets its own
    // foreground, so an outer .foregroundStyle can't recolor it from outside.
    var destructive = false

    private var foreground: Color {
        if filled { return .white }
        return destructive ? .clay600 : .sage700
    }

    private var background: Color {
        if filled { return .sage600 }
        return destructive ? .clay100 : .sage100
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(foreground)
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
            .background(background, in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
