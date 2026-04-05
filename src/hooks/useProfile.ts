import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import React from "react";

interface ProfileContextType {
  profileId: string | null;
  profile: { id: string; full_name: string; telefoon: string; adres: string; rijbewijs: boolean; vaste_vrije_dagen: number[]; uurtarief: number | null } | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profileId: null,
  profile: null,
  loading: true,
  refetch: async () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, telefoon, adres, rijbewijs, vaste_vrije_dagen, uurtarief")
      .eq("user_id", user.id)
      .single();
    if (data) setProfile(data as any);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchProfile();
  }, [user]);

  return React.createElement(
    ProfileContext.Provider,
    {
      value: {
        profileId: profile?.id ?? null,
        profile,
        loading,
        refetch: fetchProfile,
      },
    },
    children
  );
}

export const useProfile = () => useContext(ProfileContext);
