import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/hooks/use-users", () => ({
  useUpdateMyProfile: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { EditProfileModal } from "@/components/profile/edit-profile-modal";
import { useUpdateMyProfile } from "@/hooks/use-users";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

const updateMyProfileMock = vi.fn();
const onCloseMock = vi.fn();
const onSuccessMock = vi.fn();

const baseUser: AuthUser = {
  id: "1",
  firstName: "Administrador",
  lastName: "Sistema",
  email: "admin@ensenaperu.org",
  documentNumber: "00000001",
  role: { code: "ADMIN_SISTEMA", name: "Administrador del Sistema" },
  onboardingCompleted: true,
  authSource: "LOCAL",
};

function mockUser(user: AuthUser | null) {
  vi.mocked(useAuthStore).mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selector: (state: any) => unknown) => selector({ user })
  );
}

function renderModal() {
  render(<EditProfileModal onClose={onCloseMock} onSuccess={onSuccessMock} />);
}

describe("EditProfileModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMyProfileMock.mockResolvedValue(undefined);
    vi.mocked(useUpdateMyProfile).mockReturnValue({
      updateMyProfile: updateMyProfileMock,
      isLoading: false,
    });
    mockUser(baseUser);
  });

  it("permite guardar un correo válido no corporativo y muestra recomendación", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/correo electronico/i), {
      target: { value: "persona@gmail.com" },
    });

    expect(
      screen.getByText(/recomendamos usar tu correo corporativo/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(updateMyProfileMock).toHaveBeenCalledWith({
        firstName: "Administrador",
        lastName: "Sistema",
        email: "persona@gmail.com",
      });
    });
  });

  it("no muestra recomendación para correo corporativo recomendado", () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/correo electronico/i), {
      target: { value: "persona@ensenaperu.org" },
    });

    expect(
      screen.queryByText(/recomendamos usar tu correo corporativo/i)
    ).not.toBeInTheDocument();
  });

  it("bloquea guardar cuando el formato de correo es inválido", async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText(/correo electronico/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(await screen.findByText(/ingresa un correo válido/i)).toBeInTheDocument();
    expect(updateMyProfileMock).not.toHaveBeenCalled();
  });
});
