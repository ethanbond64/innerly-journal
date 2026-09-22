package main

type AuthService struct {
}

// Version — GET /api/version
// No auth service equivalent elsewhere, so the app version lives here for now.
func (a *AuthService) Version() (map[string]any, error)

// Share — GET /api/share (admin only)
func (a *AuthService) Share() (map[string]any, error)

// Signup — POST /api/signup
func (a *AuthService) Signup(email string, password string, share string) (map[string]any, error)

// Login — POST /api/login
func (a *AuthService) Login(email string, password string) (map[string]any, error)

// UpdatePassword — POST /api/update_password
func (a *AuthService) UpdatePassword(currentPassword string, newPassword string) (map[string]any, error)

// UpdateUser — POST /api/update/users/<id>
// Settings are the only updatable field.
func (a *AuthService) UpdateUser(id int, settings map[string]any) (*User, error)

// AuthLockKeyCache — POST /api/lock/auth
// Warms the scrypt lock key cache; reports whether the cached auth expired.
func (a *AuthService) AuthLockKeyCache(password string) (map[string]any, error)