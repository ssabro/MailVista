# MailVista

A modern, secure desktop email client built with Electron, React, and TypeScript.

Electron, React, TypeScript로 만든 현대적이고 안전한 데스크톱 이메일 클라이언트입니다.
<img width="1440" height="1256" alt="image" src="https://github.com/user-attachments/assets/a03244f1-18f8-498f-b982-fb43ca1d4f6b" />


![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)

## Features

### Core Email Functions
- **Multi-Account Support** - Manage multiple email accounts (Gmail, Outlook, Naver, Kakao, Yahoo, iCloud, etc.)
- **OAuth Authentication** - Secure login with Google and Microsoft OAuth
- **IMAP/SMTP** - Full IMAP and SMTP protocol support
- **Rich Text Compose** - HTML email composition with rich text editor
- **Attachments** - Send and receive attachments with drag & drop support
- **Search** - Full-text search with advanced filters (sender, date, attachments, etc.)

### Security
- **End-to-End Encryption**
  - PGP (OpenPGP) encryption
  - S/MIME certificate-based encryption
  - Signal Protocol for MailVista-to-MailVista communication
- **Content Security**
  - External image blocking (tracking protection)
  - Dangerous attachment warnings (.exe, .bat, etc.)
  - Homograph/Punycode URL detection
- **Email Authentication**
  - SPF/DKIM/DMARC verification display
- **App Security**
  - PIN code lock
  - Auto-lock on idle

### Productivity
- **AI Features** (OpenAI, Anthropic, Google AI)
  - Email summarization
  - Smart reply generation
  - Tone conversion
  - Translation
  - Email Q&A
- **Address Book** - Contact management with groups and VIP
- **Templates** - Save and reuse email templates
- **Signatures** - Multiple signature support
- **Auto-Classification** - Rule-based email filtering
- **Scheduled Send** - Send emails at a specific time
- **Delayed Send** - Undo send within configurable time

### Integration
- **Trello** - Create Trello cards from emails
- **Large File Upload** - Google Drive, Transfer.sh integration

### User Experience
- **Multi-Language** - Korean, English, Japanese, Chinese
- **Offline Mode** - Read cached emails and queue sends offline
- **System Tray** - Minimize to tray, new mail notifications
- **Dark/Light Theme** - Coming soon

## Screenshots

> Screenshots coming soon

## Installation

### Download

Download the latest release for your platform:
- **Windows**: `MailVista-Setup-x.x.x.exe`
- **macOS**: `MailVista-x.x.x.dmg`
- **Linux**: `MailVista-x.x.x.AppImage`

### Build from Source

#### Prerequisites
- Node.js 18+
- npm 9+

#### Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/mailvista.git
cd mailvista

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | TypeScript check and build |
| `npm run build:win` | Build for Windows |
| `npm run build:mac` | Build for macOS |
| `npm run build:linux` | Build for Linux |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

### Project Structure

```
mailvista/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # Main entry, IPC handlers
│   │   ├── mail-service.ts   # IMAP/SMTP operations
│   │   ├── security.ts       # Security utilities
│   │   ├── encryption/       # PGP, S/MIME encryption
│   │   ├── e2e/              # Signal Protocol E2E
│   │   ├── storage/          # SQLite database, file storage
│   │   └── settings/         # App configuration
│   │
│   ├── preload/              # Electron preload scripts
│   │
│   └── renderer/             # React frontend
│       └── src/
│           ├── App.tsx       # Main application component
│           ├── components/   # React components
│           │   └── ui/       # shadcn/ui base components
│           └── i18n/         # Internationalization
│               └── locales/  # Translation files
│
├── resources/                # App icons and assets
├── docs/                     # Documentation
└── electron-builder.yml      # Build configuration
```

### Architecture

#### Electron Process Model

```
┌─────────────────────────────────────────────────┐
│                 Main Process                     │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │
│  │   IMAP    │  │   SMTP    │  │  Encryption │ │
│  │  Service  │  │  Service  │  │   Service   │ │
│  └───────────┘  └───────────┘  └─────────────┘ │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │
│  │  SQLite   │  │   File    │  │   Settings  │ │
│  │    DB     │  │  Storage  │  │    Store    │ │
│  └───────────┘  └───────────┘  └─────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ IPC
┌─────────────────────┴───────────────────────────┐
│               Renderer Process                   │
│  ┌─────────────────────────────────────────────┐│
│  │              React Application               ││
│  │  ┌─────────┐ ┌─────────┐ ┌───────────────┐ ││
│  │  │ Email   │ │ Compose │ │   Settings    │ ││
│  │  │  View   │ │  View   │ │     View      │ ││
│  │  └─────────┘ └─────────┘ └───────────────┘ ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

#### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 28 |
| Frontend | React 18, TypeScript 5 |
| Styling | Tailwind CSS, shadcn/ui |
| State | React hooks |
| Email | imapflow, nodemailer, mailparser |
| Database | SQLite (better-sqlite3) |
| Encryption | OpenPGP.js, node-forge |
| AI | OpenAI, Anthropic, Google AI SDKs |
| i18n | i18next, react-i18next |
| Build | electron-builder |

### Setting Up Email Accounts

#### Gmail
1. Enable 2-Step Verification in your Google Account
2. Generate an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Use the App Password in MailVista

#### Outlook/Hotmail
1. Enable 2-Step Verification in your Microsoft Account
2. Generate an App Password in Security settings
3. Use the App Password in MailVista

#### Other Providers
Most providers require IMAP to be enabled and may require an app-specific password.

## Configuration

### OAuth Setup (Optional)

For OAuth authentication with Google/Microsoft, you need to set up your own OAuth credentials:

1. **Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project
   - Enable Gmail API
   - Create OAuth 2.0 credentials (Desktop app)
   - Enter Client ID and Secret in MailVista settings

2. **Microsoft OAuth**
   - Go to [Azure Portal](https://portal.azure.com)
   - Register a new application
   - Add redirect URI
   - Create client secret
   - Enter credentials in MailVista settings

### AI Features (Optional)

To use AI features, add your API key in Settings > AI:
- OpenAI: [platform.openai.com](https://platform.openai.com)
- Anthropic: [console.anthropic.com](https://console.anthropic.com)
- Google AI: [makersuite.google.com](https://makersuite.google.com)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This is an independent open-source email client project. It is not affiliated with, endorsed by, or connected to Naver, Google, Microsoft, or any other email service provider. All product names, logos, and brands are property of their respective owners.

## Acknowledgments

- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [ImapFlow](https://imapflow.com/)
- [Nodemailer](https://nodemailer.com/)
