# NestJS Project

Backend application built with NestJS framework.

## 📂 Project Structure

```
src/
├── config/             # Configuration module
│   ├── config.module.ts
│   └── config.ts
├── user/               # User module (CRUD)
│   ├── user.controller.spec.ts
│   ├── user.controller.ts
│   └── user.module.ts
├── app.module.ts       # Root module
└── main.ts             # Entry point
test/                   # E2E tests
```

## 🏗 Architecture Justification

This project is built on NestJS, which provides an out-of-the-box application architecture inspired by Angular.
Unlike unopinionated frameworks (like Express), Nest enforces a structure that promotes best practices, enabling the creation of highly testable, scalable, loosely coupled, and easily maintainable applications.
The architecture is based on the "First Steps" guide and best practices for modular applications.

### Key Architectural Principles

- **Modular (Scalable):** The application is structured into Modules. Each module encapsulates a specific domain or feature (e.g., `ConfigModule`, `UserModule`). This logical separation allows the application to scale horizontally; features can be easily extracted into microservices or reused across different parts of the system without tight entanglements.

- **Loosely Coupled (Dependency Injection):** NestJS uses a powerful Dependency Injection (DI) system. Instead of hard-coding dependencies (e.g., `const service = new UserService()`), classes request what they need through their constructors. The Nest runtime (IoC Container) manages the instantiation. This ensures that components do not depend on concrete implementations but rather on interfaces or tokens.

- **Highly Testable:** Because of the loose coupling provided by DI, testing becomes straightforward. When writing unit tests, we can easily swap out real database connections or external API services with mock objects. We can test the business logic of a Controller or Service in isolation without spinning up the entire application context.

- **Maintainable:** Nest imposes a strict directory structure and separates concerns using dedicated components: Controllers (handling requests), Services (business logic), Pipes (validation), Guards (authorization), and Interceptors (response mapping). This standardization means any developer familiar with Nest can immediately navigate the codebase, reducing technical debt over time.

### 1. Modular Design

Following NestJS philosophy, the application is structured into modules. Each logical part of the domain is encapsulated in its own directory:

- **AppModule** - the root module that assembles all feature modules.
- **ConfigModule** - located in `src/config`, this module handles environment variables (via `.env`), ensuring a centralized configuration strategy.

### 2. User Module & CRUD Integration

As per the assignment requirements and lecture notes, a specific User Module has been integrated (`src/user/`).

- **user.module.ts** - organizes the dependency injection context for the user feature.
- **user.controller.ts** - handles incoming HTTP requests and returns responses.
  - It implements full CRUD (Create, Read, Update, Delete) functionality.
  - It utilizes standard decorators (`@Get`, `@Post`, `@Put`, `@Delete`, `@Body`, `@Param`) strictly following the Controllers documentation.
- **user.controller.spec.ts** - contains unit tests for the controller, ensuring code reliability.

### 3. Entry Point

The `main.ts` file utilizes `NestFactory` to create the application instance. This is the standard entry point where global pipes, validation, and the listening port are configured.

### 4. Testing

The structure includes a `test/` directory for End-to-End (E2E) testing (`app.e2e-spec.ts`), allowing for verification of the API routes from an external perspective.

## 🚀 Getting Started

Ensure you have Node.js (version specified in `.nvmrc`) and Yarn installed.

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Environment Setup. Create a `.env` file based on the example:

   ```bash
   cp .env.example .env
   ```

3. Run the application (Development mode):

   ```bash
   yarn start:dev
   ```

## 📚 References

- [NestJS Documentation: First Steps](https://docs.nestjs.com/first-steps)
- [NestJS Controllers](https://docs.nestjs.com/controllers)
- [NestJS Modules](https://docs.nestjs.com/modules)
