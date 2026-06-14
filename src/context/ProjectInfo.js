// This file acts as a knowledge base for the project architecture.
// It is located here as requested by the user, although documentation
// typically resides in a /docs folder.

export const PROJECT_CONTEXT = {
  name: "Newton School of Technology - Faculty Onboarding Portal",
  purpose: "Manage faculty onboarding (Lab Instructors).",
  architecture: "React SPA (Vite) + Supabase (Auth/Postgres/RLS)",
  keyPattern: "Declarative security (RLS) + Frontend-driven state management.",
  
  // High-level dependency map
  dependencies: {
    frontend: ["React", "Supabase JS", "react-router-dom"],
    backend: ["Supabase Auth", "PostgreSQL", "RLS Policies"]
  }
};
