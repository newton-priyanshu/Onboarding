// This file acts as a knowledge base for the project architecture.
// It is located here as requested by the user, although documentation
// typically resides in a /docs folder.

interface ProjectDependencies {
  frontend: string[];
  backend: string[];
}

interface ProjectContext {
  name: string;
  purpose: string;
  architecture: string;
  keyPattern: string;
  dependencies: ProjectDependencies;
}

export const PROJECT_CONTEXT: ProjectContext = {
  name: "Newton School of Technology - Faculty Onboarding Portal",
  purpose: "Manage faculty onboarding (Lab Instructors).",
  architecture: "React SPA (Vite) + Supabase (Auth/Postgres/RLS)",
  keyPattern: "Declarative security (RLS) + Frontend-driven state management.",
  dependencies: {
    frontend: ["React", "Supabase JS", "react-router-dom"],
    backend: ["Supabase Auth", "PostgreSQL", "RLS Policies"]
  }
};
