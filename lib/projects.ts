export interface Project {
  id: string;
  name: string;
  host: string;
  port: number;
  path: string;
  createdAt: number;
}

const PROJECTS_KEY = "openrelay:projects";

export function getProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function getProject(id: string): Project | undefined {
  return getProjects().find((p) => p.id === id);
}

export function saveProject(project: Project): void {
  const projects = getProjects();
  const idx = projects.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    projects[idx] = project;
  } else {
    projects.unshift(project);
  }
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 20)));
  } catch {}
}

export function deleteProject(id: string): void {
  const projects = getProjects().filter((p) => p.id !== id);
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {}
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
