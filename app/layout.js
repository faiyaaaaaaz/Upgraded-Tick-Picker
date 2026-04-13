import "./globals.css";

export const metadata = {
  title: "Tick Picker",
  description: "Upload a tick CSV and analyze min/max Bid and Ask values."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
