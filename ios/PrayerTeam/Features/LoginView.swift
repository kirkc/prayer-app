import SwiftUI

struct LoginView: View {
    @Environment(AuthStore.self) private var auth
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 8) {
                Text("Prayer Team")
                    .font(.display(34))
                    .foregroundStyle(Color.ink800)
                Text("Sign in to see what your church is praying for.")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink400)
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 32)
            .riseIn()

            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Email")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink600)
                    // Placeholder drawn by hand rather than via the field's
                    // own prompt: the system styles that with the accent
                    // color (it was rendering blue), and the typed text
                    // needs an explicit color too or it inherits white.
                    ZStack(alignment: .leading) {
                        if email.isEmpty {
                            Text("you@example.com")
                                .font(.system(size: 15))
                                .foregroundStyle(Color.ink300)
                        }
                        TextField("", text: $email)
                            .font(.system(size: 15))
                            .foregroundStyle(Color.ink800)
                            .textFieldStyle(.plain)
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    .fieldBox()
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Password")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink600)
                    ZStack(alignment: .leading) {
                        if password.isEmpty {
                            Text("••••••••")
                                .font(.system(size: 15))
                                .foregroundStyle(Color.ink300)
                        }
                        SecureField("", text: $password)
                            .font(.system(size: 15))
                            .foregroundStyle(Color.ink800)
                            .textFieldStyle(.plain)
                            .textContentType(.password)
                    }
                    .fieldBox()
                }

                if let error = auth.signInError {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.red.opacity(0.8))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await auth.signIn(email: email, password: password) }
                } label: {
                    Text(auth.busy ? "Signing in…" : "Sign in")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(auth.busy || email.isEmpty || password.isEmpty)
                .opacity(auth.busy || email.isEmpty || password.isEmpty ? 0.5 : 1)
            }
            .padding(28)
            .card()
            .riseIn(delay: 0.1)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.mist50.ignoresSafeArea())
    }
}
