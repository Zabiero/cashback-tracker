import { cx } from './cx';

it('joins truthy class names with spaces', () => {
  expect(cx('a', false, 'b', null, undefined, '')).toBe('a b');
  expect(cx()).toBe('');
});
