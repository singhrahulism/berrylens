import React, { useEffect } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useLocationStore } from "../store/locationStore";
import { fetchNearbyPeople } from "../queryClient";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "Map">;

export function MapScreen({ navigation }: Props) {
  const { lat, lng, jitter } = useLocationStore();
  const peopleQuery = useQuery({ queryKey: ["nearbyPeople"], queryFn: fetchNearbyPeople });

  useEffect(() => {
    console.log("MapScreen mounted");
  }, []);

  async function sendWave() {
    console.log("sending wave");
    const response = await fetch("https://jsonplaceholder.typicode.com/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "wave", from: "me" }),
    });
    const created = await response.json();
    console.log("wave sent", created.id);
  }

  async function saveNote() {
    await AsyncStorage.setItem("lastNote", `visited at ${new Date().toISOString()}`);
    const stored = await AsyncStorage.getItem("lastNote");
    console.log("note saved", stored);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Map</Text>
      <Text>
        lat {lat.toFixed(4)}, lng {lng.toFixed(4)}
      </Text>
      <View style={styles.button}>
        <Button title="Jitter Location" onPress={jitter} />
      </View>
      <View style={styles.button}>
        <Button title="Send Wave" onPress={sendWave} />
      </View>
      <View style={styles.button}>
        <Button title="Refetch Nearby People" onPress={() => peopleQuery.refetch()} />
      </View>
      <View style={styles.button}>
        <Button title="Save Note to Storage" onPress={saveNote} />
      </View>

      <Text style={styles.subheading}>Nearby people ({peopleQuery.status})</Text>
      {(peopleQuery.data ?? []).map((person) => (
        <View key={person.id} style={styles.button}>
          <Button title={`Open ${person.name}`} onPress={() => navigation.navigate("PersonSheet", { name: person.name })} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 8 },
  heading: { fontSize: 24, fontWeight: "bold", marginBottom: 8 },
  subheading: { fontSize: 18, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  button: { marginVertical: 4 },
});
