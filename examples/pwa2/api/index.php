<?php

//input vars
$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 0;
$offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;
$order = isset($_GET['order']) ? htmlspecialchars($_GET['order']) : 'id.asc';

//mock db records
$data = json_decode(file_get_contents('data.json'), true) ?: [];

//is DELETE?
if($_SERVER['REQUEST_METHOD'] == 'DELETE') {
	//loop through array
	foreach($data as $key => $val) {
		if($id && $val['id'] == $id) {
			unset($data[$key]);
			break;
		}
	}
	//reset keys
	$data = array_values($data);
	//save to db
	file_put_contents('data.json', json_encode($data));
	//set output
	$output = [
		'result' => 'ok',
	];
}

//is POST?
if($_SERVER['REQUEST_METHOD'] == 'POST') {
	//get record from input
	$newId = null;
	$record = isset($_POST['record']) ? $_POST['record'] : [];
	//decode json?
	if(is_string($record)) {
		$record = json_decode($record, true);
	}
	//save data?
	if($record && is_array($record)) {
		//format record keys
		foreach($record as $k => $v) {
			if($v == 'true') {
				$record[$k] = true;
			} else if($v == 'false') {
				$record[$k] = false;
			} else if($v == 'null') {
				$record[$k] = null;
			}
		}
		//create or update?
		if(isset($record['id']) && $record['id']) {
			//loop through array
			foreach($data as $key => $val) {
				if($val['id'] == $record['id']) {
					$data[$key] = $record;
					break;
				}
			}
		} else {
			$record['id'] = count($data) + 1;
			$data[] = $record;
			$newId = $record['id'];
		}
		//save to db
		file_put_contents('data.json', json_encode($data), LOCK_EX);
	}
	//set output
	$output = [
		'result' => 'ok',
	];
	//add ID?
	if($newId) {
		$output['data']['id'] = $newId;
	}
}

//is GET?
if($_SERVER['REQUEST_METHOD'] == 'GET') {
	//use order?
	if($order) {
		$parts = explode('.', strtolower($order));
		$oKey = $parts[0];
		$oDir = isset($parts[1]) ? $parts[1] : 'asc';
		usort($data, function($a, $b) use($oKey, $oDir) {
			if($oDir == 'desc') {
				return $a[$oKey] < $b[$oKey] ? 1 : -1;
			} else {
				return $a[$oKey] < $b[$oKey] ? -1 : 1;
			}
		});
	}
	//use limit & offset
	$data = array_slice($data, $offset, $limit ?: null);
	//set output
	$output = [
		'result' => 'ok',
		'count' => count($data),
		'records' => $data,
	];
}

//display
header("Content-Type: application/json");
echo json_encode($output, JSON_PRETTY_PRINT);
exit();