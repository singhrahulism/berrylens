import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "PersonSheet">;

export function PersonSheetScreen({ route }: Props) {
  useEffect(() => {
    console.log(`rendering PersonSheet for ${route.params.name}`);
  }, [route.params.name]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{route.params.name}</Text>
      <Text>Nearby, last seen just now.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center" },
  heading: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
});
