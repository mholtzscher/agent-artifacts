# Scripted HTML artifacts run on the Agent Pages origin

Agent Artifacts v1 allows HTML artifact source, and raw HTML inside Markdown source, to include arbitrary scripts and styles rendered on the same origin as the main application. This prioritizes faithful rendering and implementation simplicity, while deliberately accepting stored-XSS and future-auth risks that would be reduced by an isolated artifact origin, sandboxed iframe, or sanitization.
