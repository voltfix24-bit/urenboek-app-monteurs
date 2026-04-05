import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    if (!checkRateLimit(userId)) {
      return new Response(JSON.stringify({ error: "Te veel verzoeken. Probeer het later opnieuw." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: isManager } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "manager",
    });
    if (!isManager) {
      return new Response(JSON.stringify({ error: "Alleen managers" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { titel, inhoud, urgentie, ontvangerType, profileId } = await req.json();
    if (!titel || !profileId) {
      return new Response(JSON.stringify({ error: "titel en profileId zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: mededeling, error: insertError } = await adminClient
      .from("mededelingen")
      .insert({
        titel,
        inhoud: inhoud || "",
        urgentie: urgentie || "normaal",
        ontvanger_type: ontvangerType || "iedereen",
        verzonden_door: profileId,
      })
      .select("id")
      .single();

    if (insertError || !mededeling) {
      return new Response(JSON.stringify({ error: insertError?.message || "Insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let recipientIds: string[] = [];

    if (ontvangerType === "iedereen") {
      const { data: allProfiles } = await adminClient
        .from("profiles")
        .select("id")
        .neq("id", profileId);
      recipientIds = allProfiles?.map((p) => p.id) ?? [];
    } else if (ontvangerType === "monteurs") {
      const { data: allProfiles } = await adminClient.from("profiles").select("id, user_id");
      if (allProfiles) {
        for (const p of allProfiles) {
          if (p.id === profileId) continue;
          const { data: hasManagerRole } = await adminClient.rpc("has_role", {
            _user_id: p.user_id,
            _role: "manager",
          });
          if (!hasManagerRole) recipientIds.push(p.id);
        }
      }
    }

    if (recipientIds.length > 0) {
      const leesRecords = recipientIds.map((id) => ({
        mededeling_id: mededeling.id,
        medewerker_id: id,
      }));
      await adminClient.from("mededeling_leesstatus").insert(leesRecords);
    }

    return new Response(
      JSON.stringify({ success: true, mededelingId: mededeling.id, recipients: recipientIds.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
