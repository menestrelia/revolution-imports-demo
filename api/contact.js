module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  if (process.env.CONTACT_ENABLED !== "true") {
    return res.status(503).json({
      error: "Private prototype: email delivery is not enabled."
    });
  }

  try {
    const raw =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body || {});

    if (Buffer.byteLength(raw) > 12000) {
      return res.status(413).json({
        error: "Message too long."
      });
    }

    const data = JSON.parse(raw);

    if (data.company) {
      return res.status(400).json({
        error: "Unable to submit."
      });
    }

    for (const field of ["name", "email", "phone", "vehicle", "service"]) {
      if (
        typeof data[field] !== "string" ||
        !data[field].trim() ||
        data[field].length > 200
      ) {
        return res.status(400).json({
          error: "Please check the required fields."
        });
      }
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
      /[\r\n]/.test(data.email)
    ) {
      return res.status(400).json({
        error: "Please enter a valid email."
      });
    }

    if (
      data.message !== undefined &&
      (typeof data.message !== "string" || data.message.length > 4000)
    ) {
      return res.status(400).json({
        error: "Message must be under 4000 characters."
      });
    }

    const {
      RESEND_API_KEY,
      CONTACT_FROM_EMAIL,
      CONTACT_TO_EMAIL
    } = process.env;

    if (!RESEND_API_KEY || !CONTACT_FROM_EMAIL || !CONTACT_TO_EMAIL) {
      return res.status(503).json({
        error: "Email delivery is not configured."
      });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: CONTACT_FROM_EMAIL,
        to: [CONTACT_TO_EMAIL],
        reply_to: data.email,
        subject: "Website service request",
        text: ["name", "email", "phone", "vehicle", "service", "message"]
          .map((key) => `${key}: ${data[key] || "—"}`)
          .join("\n")
      })
    });

    const body = await response.json();

    if (!response.ok || !body.id) {
      return res.status(502).json({
        error: "Email service could not accept the request. Please try again."
      });
    }

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({
      error: "Unable to process the request. Please try again."
    });
  }
};
