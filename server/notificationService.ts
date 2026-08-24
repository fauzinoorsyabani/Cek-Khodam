type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Pengiriman bersifat event-driven dan sengaja fail-soft: notifikasi dalam aplikasi
 * tetap tersimpan walaupun layanan email pihak ketiga belum dikonfigurasi atau gagal.
 */
export async function deliverTransactionalEmail(message: TransactionalEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { delivered: false, reason: "not_configured" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text }),
  });

  return { delivered: response.ok, reason: response.ok ? "sent" as const : "provider_error" as const };
}
