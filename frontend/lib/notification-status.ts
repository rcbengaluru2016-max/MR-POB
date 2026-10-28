export function notificationWasSent(status: unknown) {
  return status === "ACCEPTED" || status === "DELIVERED";
}

export function notificationLabel(status: unknown) {
  if (status === "EXPIRED") return "Rejection Details Expired";
  if (status === "DELIVERED") return "Message Delivered";
  if (status === "ACCEPTED") return "Message Sent";
  if (status === "NOT_CONFIGURED" || status === "BLOCKED") return "WhatsApp Not Configured";
  if (status === "FAILED") return "Message Failed";
  if (status === "RETRY") return "Message Retry Pending";
  if (status === "UNKNOWN") return "Delivery Unconfirmed";
  if (status === "MOCKED") return "Test Only — Not Sent";
  if (status === "PENDING" || status === "PROCESSING") return "Message Pending";
  return "Message Not Sent";
}
