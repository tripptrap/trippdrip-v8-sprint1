// lib/googleCalendar.ts
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      // service account JSON
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: SCOPES,
  });

  const calendar = google.calendar({ version: "v3", auth });
  return calendar;
}
