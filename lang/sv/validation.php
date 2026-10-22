<?php

// Swedish validation messages for the rules PlainShow uses; others fall back to English.
return [
    'accepted' => ':Attribute måste godkännas.',
    'after' => ':Attribute måste vara efter :date.',
    'array' => ':Attribute måste vara en lista.',
    'before' => ':Attribute måste vara före :date.',
    'boolean' => ':Attribute måste vara på eller av.',
    'confirmed' => 'Upprepningen av :attribute stämmer inte.',
    'current_password' => 'Lösenordet stämmer inte.',
    'email' => ':Attribute måste vara en giltig e-postadress.',
    'exists' => 'Vald :attribute finns inte.',
    'image' => ':Attribute måste vara en bild.',
    'in' => 'Vald :attribute är inte giltig.',
    'integer' => ':Attribute måste vara ett heltal.',
    'max' => [
        'array' => ':Attribute får inte ha fler än :max saker.',
        'file' => ':Attribute får inte vara större än :max kilobyte.',
        'numeric' => ':Attribute får inte vara större än :max.',
        'string' => ':Attribute får inte vara längre än :max tecken.',
    ],
    'mimes' => ':Attribute måste vara en fil av typen: :values.',
    'min' => [
        'array' => ':Attribute måste ha minst :min saker.',
        'file' => ':Attribute måste vara minst :min kilobyte.',
        'numeric' => ':Attribute måste vara minst :min.',
        'string' => ':Attribute måste vara minst :min tecken.',
    ],
    'numeric' => ':Attribute måste vara ett tal.',
    'present' => ':Attribute måste finnas med.',
    'regex' => 'Formatet på :attribute är inte giltigt.',
    'required' => ':Attribute måste fyllas i.',
    'size' => [
        'string' => ':Attribute måste vara :size tecken.',
        'numeric' => ':Attribute måste vara :size.',
    ],
    'string' => ':Attribute måste vara text.',
    'unique' => 'Det här :attribute används redan.',
    'url' => ':Attribute måste vara en giltig länk.',
    'attributes' => [
        'name' => 'namn', 'color' => 'färg', 'username' => 'användarnamn', 'firstName' => 'förnamn', 'lastName' => 'efternamn',
        'email' => 'e-post', 'password' => 'lösenord', 'current_password' => 'nuvarande lösenord', 'code' => 'kod', 'role' => 'roll',
        'status' => 'status', 'title' => 'rubrik', 'url' => 'länk', 'userId' => 'person', 'confirmUsername' => 'användarnamn',
    ],
];
