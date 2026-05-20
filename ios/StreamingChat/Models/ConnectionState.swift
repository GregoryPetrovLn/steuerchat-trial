import Foundation

enum ConnectionState: String {
    case connected = "Connected"
    case reconnecting = "Reconnecting..."
    case offline = "Offline"
    case failed = "Connection Failed"
}
