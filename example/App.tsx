import React from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { attachInspector, inspectStore } from "berrylens";
import { queryClient } from "./src/queryClient";
import { useLocationStore } from "./src/store/locationStore";
import { MapScreen } from "./src/screens/MapScreen";
import { PersonSheetScreen } from "./src/screens/PersonSheetScreen";
import type { RootStackParamList } from "./src/screens/types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const inspector = attachInspector({
  appName: "berrylens-example",
  queryClient,
  navigationRef,
});
inspector.attach(inspectStore(useLocationStore, "locationStore"));

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator initialRouteName="Map">
          <Stack.Screen name="Map" component={MapScreen} />
          <Stack.Screen name="PersonSheet" component={PersonSheetScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
