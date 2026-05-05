import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../pages/LoginPage";
import { AuthProvider } from "../contexts/AuthContext";

vi.mock("../api/endpoints", () => ({
  authApi: {
    me: vi.fn().mockResolvedValue({ data: null }),
    login: vi.fn().mockResolvedValue({ data: { access_token: "x", refresh_token: "y" } }),
  },
}));

beforeEach(() => {
  localStorage.clear();
});

describe("LoginPage", () => {
  it("renders the email and password fields", async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("calls login when submitted", async () => {
    const { authApi } = await import("../api/endpoints");
    authApi.me.mockResolvedValueOnce({ data: { id: 1, email: "x@x", role: "admin", full_name: "x" } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    );

    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: "a@b.c" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw1234567" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(authApi.login).toHaveBeenCalledWith("a@b.c", "pw1234567"));
  });
});
