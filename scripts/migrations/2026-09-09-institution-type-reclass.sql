-- 2026-09-09 — Reclassify institutions out of the catch-all "other" (and, for
-- UberEats, out of an ill-fitting "subscription") into the 13 new
-- institution_type values added alongside this migration (ADR-099).
-- Data-only, no schema change — institution_type is a free-text column with
-- no DB constraint; the allowed-values list lives client-side in
-- src/components/InstitutionDialog.tsx.
--
-- Mapping decided interactively with the user; a handful of genuinely
-- ambiguous names (Dept of Education, DFAS, Gavora's, Lacey Miller,
-- MoneyLion, The Sheet Code) are deliberately left as "other".

begin;

update public.institutions set institution_type = 'restaurant' where id in (
  '4063bb26-f187-4b46-a7e4-5763676ffcbf', -- ASRC Snack Bar
  '6ee0a791-23ee-4323-8be1-e092671a25c9', -- Bamboo Panda
  '0dec2ead-f20e-4eb3-b959-d40e086ff7dd', -- Brewster's Restaurant
  '30207fd5-2099-44cd-9eaa-757b9402c256', -- Burger King
  '7ffecf4f-853f-4f27-a426-86bf56249ab7', -- Duncan's Sno-balls
  '407c67d6-5cec-4755-95d4-51d0bfd86d8f', -- East Ramp Pizza
  '71c04f23-da43-4d1a-8062-ccece7a695d2', -- Fatburger
  'f5c554ce-2c3d-42a8-b5b0-f493291956a6', -- Gallo's Mexican Restaurant
  '4043c8be-7c50-4077-a369-ade9272371fa', -- Gyro and More Falafel
  '4546fa0e-5251-4e67-a089-b0eadc40ccdb', -- KFC
  'f007916f-3bd7-488a-808a-a078be3fbd27', -- Little Owl Cafe
  '016d03d5-6646-4b1b-9b10-c1189e3cc452', -- McDonald's
  '6489f2a0-5070-410f-83ae-a537879377b5', -- North Pole Alehouse
  '0fa500c7-1ecf-4004-be3c-abd2b0afd5d9', -- Pagoda Chinese Restaurant
  '7ebbdd0c-1871-4fdc-9c61-c2b06d642ece', -- Saigon Garden
  '7ce9f1fd-3e8d-4f65-9542-e298381b9988', -- Siam Square Thai Restaurant
  '5ea01191-9746-4177-ad34-aec3a8d65bd3', -- Sonic
  'ba9a8635-762a-43de-86ee-5b33775bb5d9', -- Starbucks
  'e4355812-04ad-49cc-965a-5c0de5042f8e', -- Stir It Up
  'c926ff12-9b44-4ebf-a026-39121df9b5ab', -- Sunrise Bagel & Espresso
  '8ad24312-3d73-43fc-8844-5888750d2c64', -- Taco Bell
  'a6138d14-c3cd-4ab0-8655-50f02685c284', -- Thai Cuisine Restaurant
  '449748c9-dcf2-48e3-8ec8-070fdecb0f18', -- The Bakery Restaurant
  'f78e2e1d-f9fa-4f2b-a51e-475c10736ba7', -- Thumbs Up by Gnap
  'e97eb306-7063-4fc9-99b8-060ce76b7ce3'  -- Wendy's
);

update public.institutions set institution_type = 'grocery_store' where id in (
  'c166c7bd-4b67-4eb2-90ab-0854acca957d', -- Fred Meyers
  '10da1df2-73fb-4697-ab47-272195075679', -- Safeway
  '1aebadd0-591f-4a7e-9a1b-80fac51a1050'  -- Three Bears Alaska
);

update public.institutions set institution_type = 'gas_station' where id in (
  'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -- Circle K
  '81ef3981-b584-4ecf-8b94-e0351a9ced11', -- Air Tire or Vac
  'ca5031c3-5c58-490d-ab2b-7779218c9a5c'  -- FTWW Express Shoppette
);

update public.institutions set institution_type = 'liquor_store' where id in (
  '0efafa02-bfe0-44e7-ae5b-389222ef9ee7', -- Brown Jug
  'cd4a82c0-45ae-4796-8aa8-17145793f37f', -- Gold Star Liquor
  'a5daa10e-c0f0-40ba-8b83-5a817963421a'  -- McPeaks
);

update public.institutions set institution_type = 'department_store' where id in (
  '85e88a17-bd0a-4a5f-8967-0c86cfa39c7c', -- Walmart
  'b5324561-29a1-40fc-8de6-eb0f078027f5', -- Value Village
  'a5703b09-72de-4c34-806f-b992cd152192', -- Exchange - Eielson AFB
  '00e0a658-5edb-4129-ae7e-e26e3d4da3f4'  -- Amazon
);

update public.institutions set institution_type = 'specialty_store' where id in (
  '86ca768a-a2da-43f9-853e-563283f6e293', -- Angel Donkey Designs
  '797310b1-e0f6-443e-aad9-eaa12892c778', -- Beautifully Wicked
  'cdda28fd-798c-48e5-9024-b54339806745', -- O'Reilly Auto Parts
  '52d0e913-6413-472e-8a5a-0aadb2a43c5d', -- Vape Gift
  'd5c373ef-4b33-4224-b1fb-0a11c33f970d'  -- Wicca Vibes
);

update public.institutions set institution_type = 'venue' where id in (
  '7a5fe8cb-ad9e-426e-8248-e038e7244163'  -- Carlson Center
);

update public.institutions set institution_type = 'game' where id in (
  'ae626ea5-c511-477f-b19d-a8fac52e8b37', -- My Leisure Time Game
  'deba8862-aa51-4481-a8fb-5cbfd246423e', -- Pixel Flow
  '038a2a5a-aa70-439b-a120-13e302a7b7c4', -- Pokemon GO
  'b7424878-1ad5-4eb2-8f8f-dbc276a40a0d', -- Watcher of Realms
  'ffdcf2f0-038c-44bd-9855-4bc270829886'  -- Cat Soup
);

update public.institutions set institution_type = 'app' where id in (
  '8688a388-f413-4ad2-8559-6f2db62f60e5', -- Snapchat
  '9ee04161-b1ce-4146-aaad-6f744df76310'  -- DAWG Self Discipline
);

update public.institutions set institution_type = 'dispensary' where id in (
  'f06240f2-c46e-45c2-b9d0-7161fb33d4e4'  -- Nature's Releaf LLC
);

update public.institutions set institution_type = 'personal_care' where id in (
  '282242d3-5611-4b54-a4a9-873c23df6b66'  -- Razor's Edge
);

update public.institutions set institution_type = 'employer' where id in (
  '850f28b0-d705-47cf-aeb6-b2db115389e7'  -- ASRC Federal
);

update public.institutions set institution_type = 'delivery' where id in (
  '63047dee-3cad-429d-92ed-7067569f41f5', -- DoorDash
  'd8f0d0f6-7e50-47c6-82de-8051effedd11'  -- UberEats (was 'subscription')
);

commit;
