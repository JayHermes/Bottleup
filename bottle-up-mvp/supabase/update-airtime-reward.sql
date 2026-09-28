-- Keep the stable catalog ID and existing redemption history.
update public.reward_catalog
set name = '₦500 Airtime', note = 'Mobile airtime reward'
where id = 'free-pickup';
