import SwiftUI

struct ConnectionBanner: View {
    let state: ConnectionState

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: iconName)
                .font(.caption)
            Text(state.rawValue)
                .font(.caption)
                .fontWeight(.medium)
        }
        .foregroundStyle(foregroundColor)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(backgroundColor)
    }

    private var iconName: String {
        switch state {
        case .connected:      return "checkmark.circle.fill"
        case .reconnecting:   return "arrow.triangle.2.circlepath"
        case .offline:        return "wifi.slash"
        case .failed:         return "exclamationmark.triangle.fill"
        }
    }

    private var backgroundColor: Color {
        switch state {
        case .connected:      return .green.opacity(0.15)
        case .reconnecting:   return .yellow.opacity(0.2)
        case .offline:        return .red.opacity(0.15)
        case .failed:         return .red.opacity(0.2)
        }
    }

    private var foregroundColor: Color {
        switch state {
        case .connected:      return .green
        case .reconnecting:   return .orange
        case .offline, .failed: return .red
        }
    }
}

#Preview {
    VStack(spacing: 0) {
        ConnectionBanner(state: .reconnecting)
        ConnectionBanner(state: .offline)
        ConnectionBanner(state: .failed)
        ConnectionBanner(state: .connected)
    }
}
