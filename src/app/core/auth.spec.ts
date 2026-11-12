import { sha256 } from './sha256';
import { AuthError, AuthService } from './auth.service';
import { TestBed } from '@angular/core/testing';

describe('sha256', () => {
  it('matches the standard test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('a'.repeat(100))).toBe('2816597888e4a0d3a36b82b83316ab32680eb8f00f8cd3b904d681246d285a0e');
  });
});

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('registers, logs out and logs back in; rejects bad input', () => {
    const auth = TestBed.inject(AuthService);
    auth.register('Ahmed', 'a@b.co', 'secret12');
    expect(auth.loggedIn()).toBe(true);
    auth.logout();
    expect(() => auth.login('a@b.co', 'wrongpass')).toThrow(AuthError);
    auth.login('A@B.co', 'secret12');
    expect(auth.user()?.name).toBe('Ahmed');
    expect(() => auth.register('x', 'a@b.co', 'secret12')).toThrow(AuthError);
    expect(() => auth.register('x', 'bad', 'secret12')).toThrow(AuthError);
    expect(() => auth.register('x', 'c@d.co', '123')).toThrow(AuthError);
  });
});
