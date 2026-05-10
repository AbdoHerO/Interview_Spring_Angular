// Application configuration: sources, credentials, AI settings.
window.APP_CONFIG = {
  auth: {
    username: 'abdohero',          // see .env → APP_USERNAME
    password: 'ABDOwahna135795',   // see .env → APP_PASSWORD
  },

  // Each entry maps to a file under ./files/
  // type: 'md' -> markdown file (basePath used for image resolution)
  // type: 'pdf' -> rendered as embedded viewer
  sections: {
    concepts: [
      {
        id: 'business-manager',
        title: 'Business Manager (IT)',
        type: 'md',
        path: 'files/Business Manager (IT) .md',
        basePath: 'files/',
        description: 'Role, responsibilities and key concepts of an IT Business Manager.',
      },
      {
        id: 'java',
        title: 'Java 8 / 17 Interview',
        type: 'md',
        path: 'files/Java 8 17 Interview .md',
        basePath: 'files/',
        description: 'Modern Java features from 8 through 17.',
      },
      {
        id: 'spring-boot',
        title: 'Spring Boot Interview',
        type: 'md',
        path: 'files/Spring Boot Interview/Spring Boot Interview.md',
        basePath: 'files/Spring Boot Interview/',
        description: 'Core Spring Boot concepts, autoconfiguration, actuators and more.',
      },
      {
        id: 'angular',
        title: 'Angular Interview (PDF)',
        type: 'pdf',
        path: 'files/Angular_Interview_-_47_questions.pdf',
        description: '47 essential Angular interview questions.',
      },
    ],
    qa: [
      {
        id: 'java-questions',
        title: 'Questions utils (Java)',
        type: 'md',
        path: 'files/Questions utils (Java) .md',
        basePath: 'files/',
        description: 'Quick-fire Java Q&A.',
      },
      {
        id: 'spring-questions',
        title: 'Spring Boot / Microservice / Spring Batch Q&A',
        type: 'md',
        path: 'files/Question Utils in Spring boot (Microservice Spring .md',
        basePath: 'files/',
        description: 'Useful Spring ecosystem questions.',
      },
    ],
  },

  groq: {
    apiKey: 'REPLACE_WITH_YOUR_GROQ_API_KEY', // see .env → GROQ_API_KEY
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    // Bumping `promptVersion` will replace any previously-saved system prompt
    // (only if the user hadn't customised it themselves).
    promptVersion: 2,
    defaultSystemPrompt: [
      'In French: You are a concise technical interview coach.',
      'LANGUAGE RULE (highest priority): Always reply in the SAME language as the user\'s most recent message.',
      '  - If the user writes in French → answer in French.',
      '  - If the user writes in English → answer in English.',
      '  - If the user explicitly asks "in <language>", switch immediately and stay in that language.',
      'STYLE: Direct Q&A. Give the answer first. Add at most 1–3 short bullet points only when truly necessary.',
      'Use code blocks for code. No fluff, no disclaimers, no long introductions.',
    ].join('\n'),
  },
};
