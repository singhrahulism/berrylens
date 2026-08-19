import { generateId } from "@berrylens/protocol";
import type { Capture, Emit } from "../capture";
import { safeEmit } from "../capture";

interface NavigationStateLike {
  routes: Array<{ name: string; state?: NavigationStateLike }>;
  index?: number;
}

interface NavigationStateEventLike {
  data: { state?: NavigationStateLike };
}

export interface NavigationContainerRefLike {
  addListener: (type: "state", listener: (event: NavigationStateEventLike) => void) => () => void;
  getCurrentRoute?: () => { name: string } | undefined;
}

/** Subscribes to React Navigation's own state listener — no per-transition instrumentation. */
export function navigationAdapter(navigationRef: NavigationContainerRefLike): Capture {
  return {
    name: "navigation",
    install(emit: Emit) {
      let previousRoute = navigationRef.getCurrentRoute?.()?.name;

      return navigationRef.addListener("state", (event) => {
        const currentRoute = deepestRouteName(event.data.state);
        if (currentRoute && currentRoute !== previousRoute) {
          safeEmit(emit, {
            id: generateId(),
            timestamp: Date.now(),
            category: "navigation",
            label: previousRoute ? `${previousRoute} → ${currentRoute}` : currentRoute,
            data: { from: previousRoute, to: currentRoute },
          });
          previousRoute = currentRoute;
        }
      });
    },
  };
}

function deepestRouteName(state: NavigationStateLike | undefined): string | undefined {
  if (!state || !state.routes || state.routes.length === 0) return undefined;
  const route = state.routes[state.index ?? state.routes.length - 1];
  return route.state ? deepestRouteName(route.state) : route.name;
}
