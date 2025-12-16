# ArchFlow AI

ArchFlow AI is an advanced, node-based workspace for architectural ideation and 3D visualization. Built for the hackathon, it leverages a powerful AI generation pipeline (FIBO) to transform structured architectural intents into stunning 3D isometric cutaways and realistic renderings.

![ArchFlow Demo](https://placehold.co/1200x400?text=ArchFlow+Screen+Capture)

## 🚀 Features

- **Node-Based Editor**: A flexible canvas (powered by React Flow) to structure your architectural ideas.
- **AI-Powered Visualization**: Generate high-fidelity 3D isometric views and architectural renders using the custom FIBO model.
- **Iterative Refinement**: Refine generation outputs using a structured feedback loop.
- **Real-time Collaboration**: (Planned) Share and edit workspaces.
- **Modern Stack**: Built with the latest web technologies for speed and aesthetics.

## 🛠️ Tech Stack

### Frontend (User Interface)
- **Framework**: [Next.js 16](https://nextjs.org/) (App Router)
- **Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **UI Components**: Radix UI, Lucide React, Framer Motion

### Inference (AI Backend)
- **Model**: FIBO (Fine-tuned Image Model for Architecture)
- **Infrastructure**: [RunPod](https://www.runpod.io/) Serverless GLU
- **External Services**: [Fal.ai](https://fal.ai) (for rapid prototyping/refinement)
- **Language**: Python 3.10+ (PyTorch, Diffusers)
- **Storage**: Cloudflare R2 (for generated assets)

## 📦 Project Structure

- **`fe/`**: The main Next.js frontend application.
- **`inference/`**: Python scripts and Docker configuration for the RunPod worker.
- **`db/`**: Database schema and migrations (shared/monorepo style).

## 🏁 Getting Started

### Prerequisites
- Node.js 20+
- pnpm
- Python 3.10+ (for local backend testing)
- PostgreSQL database
- RunPod / GPU Cloud account (for deployment)

### 1. Frontend Setup

Navigate to the frontend directory:
```bash
cd fe
```

Install dependencies:
```bash
pnpm install
```

Set up environment variables:
Create a `.env` file in `fe/` and add your database credentials and API keys.
```env
DATABASE_URL="postgresql://user:password@localhost:5432/archflow"
NEXTAUTH_SECRET="your-secret"
# Add other necessary keys
```

Run database migrations:
```bash
pnpm db:push
```

Start the development server:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to view the app.

### 2. Inference Backend Setup

Navigate to the inference directory:
```bash
cd inference
```

Follow the [Inference README](./inference/README.md) for detailed instructions on setting up the customized FIBO inference worker on RunPod.

## 🤝 Contributing

This project was built for a hackathon. Contributions are welcome!
1. Fork the repo.
2. Create feature branch.
3. Submit a Pull Request.

## � Team

- **[Name]** - Full Stack Developer
- **[Name]** - AI Engineer
- **[Name]** - Designer

## 🎥 Demo

[Check out our demo video here!](https://youtu.be/example)

## �📄 License

MIT
