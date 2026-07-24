import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SwipeableRow } from '../swipeable-row';

/**
 * Gate C — full-swipe-to-trigger behavior + accessibility fallback.
 *
 * Renders under the packages/ui jest reanimated + gesture-handler mocks wired in
 * `src/test-utils/jest-setup.ts`. The gesture-handler mock captures each Pan
 * builder's onBegin/onUpdate/onEnd callbacks in `__panHandlers`, so these tests
 * drive a synthetic swipe release with a controlled translation/velocity and
 * assert the real component decision logic (past-threshold / fling → onFullSwipe,
 * short drag → no callback). There is NO revealed action button anymore, so no
 * `swipeable-action-*` testID exists — one test asserts that absence directly.
 */

interface PanHandlers {
  onBegin?: () => void;
  onUpdate?: (event: { translationX: number }) => void;
  onEnd?: (event: { velocityX: number; translationX: number }) => void;
}

const gh = jest.requireMock('react-native-gesture-handler') as {
  __panHandlers: PanHandlers[];
};

const reanimated = jest.requireMock('react-native-reanimated') as {
  withTiming: jest.Mock;
  withSpring: jest.Mock;
  __setReducedMotion: (value: boolean) => void;
};

const ROW_WIDTH = 300;
// 60% of ROW_WIDTH = 180. -200 crosses it; -50 does not.
const PAST_THRESHOLD = -200;
const SHORT_DRAG = -50;

function lastPan(): PanHandlers {
  const handlers = gh.__panHandlers[gh.__panHandlers.length - 1];
  if (!handlers) throw new Error('no Pan gesture was constructed');
  return handlers;
}

beforeEach(() => {
  gh.__panHandlers.length = 0;
  reanimated.withTiming.mockClear();
  reanimated.withSpring.mockClear();
});

afterEach(() => {
  // Never leak reduced-motion state into a later test.
  reanimated.__setReducedMotion(false);
});

test('renders its child content', async () => {
  const { getByText } = await render(
    <SwipeableRow onFullSwipe={() => {}}>
      <Text>Order ready</Text>
    </SwipeableRow>,
  );
  expect(getByText('Order ready')).toBeTruthy();
});

test('a swipe past the 60% threshold followed by release calls onFullSwipe', async () => {
  const onFullSwipe = jest.fn();
  const { getByTestId } = await render(
    <SwipeableRow onFullSwipe={onFullSwipe}>
      <Text>row</Text>
    </SwipeableRow>,
  );
  // Measure the row so the threshold (60% of width) is known.
  fireEvent(getByTestId('swipeable-row'), 'layout', {
    nativeEvent: { layout: { width: ROW_WIDTH, height: 64 } },
  });

  const pan = lastPan();
  pan.onBegin?.();
  pan.onUpdate?.({ translationX: PAST_THRESHOLD });
  pan.onEnd?.({ velocityX: 0, translationX: PAST_THRESHOLD });

  expect(onFullSwipe).toHaveBeenCalledTimes(1);
});

test('a short drag that does not cross the threshold does NOT call onFullSwipe', async () => {
  const onFullSwipe = jest.fn();
  const { getByTestId } = await render(
    <SwipeableRow onFullSwipe={onFullSwipe}>
      <Text>row</Text>
    </SwipeableRow>,
  );
  fireEvent(getByTestId('swipeable-row'), 'layout', {
    nativeEvent: { layout: { width: ROW_WIDTH, height: 64 } },
  });

  const pan = lastPan();
  pan.onBegin?.();
  pan.onUpdate?.({ translationX: SHORT_DRAG });
  // Released short of the threshold and not a fling: just springs back to 0, no callback.
  pan.onEnd?.({ velocityX: 0, translationX: SHORT_DRAG });

  expect(onFullSwipe).not.toHaveBeenCalled();
});

test('a fast leftward fling triggers onFullSwipe even short of the distance threshold', async () => {
  const onFullSwipe = jest.fn();
  const { getByTestId } = await render(
    <SwipeableRow onFullSwipe={onFullSwipe}>
      <Text>row</Text>
    </SwipeableRow>,
  );
  fireEvent(getByTestId('swipeable-row'), 'layout', {
    nativeEvent: { layout: { width: ROW_WIDTH, height: 64 } },
  });

  const pan = lastPan();
  pan.onBegin?.();
  pan.onUpdate?.({ translationX: SHORT_DRAG });
  // Distance is short, but a fling faster than FLING_VELOCITY (1200) still fires.
  pan.onEnd?.({ velocityX: -1500, translationX: SHORT_DRAG });

  expect(onFullSwipe).toHaveBeenCalledTimes(1);
});

test('reduced-motion users get a withTiming snap-back, not the withSpring bounce', async () => {
  // Previously untestable — the mock's useReducedMotion was hardcoded false, so
  // this branch was unreachable from any test in the suite (found by CodeRabbit
  // review, PR #151).
  reanimated.__setReducedMotion(true);
  const { getByTestId } = await render(
    <SwipeableRow onFullSwipe={() => {}}>
      <Text>row</Text>
    </SwipeableRow>,
  );
  fireEvent(getByTestId('swipeable-row'), 'layout', {
    nativeEvent: { layout: { width: ROW_WIDTH, height: 64 } },
  });

  const pan = lastPan();
  pan.onBegin?.();
  pan.onUpdate?.({ translationX: SHORT_DRAG });
  pan.onEnd?.({ velocityX: 0, translationX: SHORT_DRAG });

  expect(reanimated.withTiming).toHaveBeenCalledWith(0, { duration: 160 });
  expect(reanimated.withSpring).not.toHaveBeenCalled();
});

test('onAccessibilityAction fires onFullSwipe directly (gesture-free path)', async () => {
  const onFullSwipe = jest.fn();
  const { getByTestId } = await render(
    <SwipeableRow onFullSwipe={onFullSwipe}>
      <Text>row</Text>
    </SwipeableRow>,
  );
  fireEvent(getByTestId('swipeable-row-content'), 'accessibilityAction', {
    nativeEvent: { actionName: 'Delete' },
  });
  expect(onFullSwipe).toHaveBeenCalledTimes(1);
});

test('the row content is marked accessible so the accessibility action is discoverable', async () => {
  // View defaults to accessible=false, which would silently hide
  // accessibilityActions from VoiceOver/TalkBack even though onAccessibilityAction
  // still fires when invoked directly (the test above can't catch that on its
  // own — jsdom doesn't gate the synthetic event on the prop the way a real
  // screen reader would).
  const { getByTestId } = await render(
    <SwipeableRow onFullSwipe={() => {}}>
      <Text>row</Text>
    </SwipeableRow>,
  );
  expect(getByTestId('swipeable-row-content').props.accessible).toBe(true);
});

test('renders no revealed action button behind the row', async () => {
  const { queryByTestId } = await render(
    <SwipeableRow onFullSwipe={() => {}}>
      <Text>row</Text>
    </SwipeableRow>,
  );
  // The old swipe-to-reveal design rendered `swipeable-action-0`; the redesign has
  // no chrome behind the row at all. Asserting its absence proves the removal.
  expect(queryByTestId('swipeable-action-0')).toBeNull();
});
