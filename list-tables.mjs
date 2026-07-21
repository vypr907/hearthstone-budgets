import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://ilxwhgqudcxsgxrvxhtb.supabase.co",
  "sb_publishable_Q56nrfX0_LE4cuKWzYYk4g_nFURfIN5",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  const { data, error } = await supabase
    .from("information_schema.tables")
    .select("table_schema, table_name")
    .eq("table_schema", "public")
    .order("table_name");

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

main();
