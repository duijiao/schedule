<?php
/**
 * 爱赞美一体化 JSON API
 *
 * 搜索歌谱：
 *   /zanmei_api.php?q=奇妙作为&page=1
 *   /zanmei_api.php?action=search&q=奇妙作为&page=1
 *
 * 可选：直接传入歌谱 ID，搜索结果中会同时带图片直链：
 *   /zanmei_api.php?q=奇妙作为&include_images=1
 *
 * 直接查询某个歌谱：
 *   /zanmei_api.php?id=49795
 *   /zanmei_api.php?action=detail&id=49795
 *
 * 一个响应中可同时返回搜索列表、详情页、图片直链。
 * 歌词/歌谱图片等内容的可用性取决于上游网站；请遵守其使用条款与版权要求。
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const SEARCH_API = 'https://api.xiaohai.org/search/sheet';
const DETAIL_BASE = 'https://www.zanmei.ai/tab/';

function outputJson(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function fetchUrl(string $url): array {
    if (!function_exists('curl_init')) {
        outputJson(['success' => false, 'error' => '服务器未启用 PHP cURL 扩展。'], 500);
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept: application/json,text/html,*/*', 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8']
    ]);
    $body = curl_exec($ch);
    $error = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $error !== '') return ['ok' => false, 'status' => $status, 'error' => $error ?: '请求失败', 'body' => ''];
    if ($status < 200 || $status >= 400) return ['ok' => false, 'status' => $status, 'error' => '上游 HTTP ' . $status, 'body' => (string)$body];
    return ['ok' => true, 'status' => $status, 'body' => (string)$body];
}

function absoluteUrl(string $url): string {
    $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    if ($url === '') return '';
    if (str_starts_with($url, '//')) return 'https:' . $url;
    if (preg_match('~^https?://~i', $url)) return $url;
    if (str_starts_with($url, '/')) return 'https://www.zanmei.ai' . $url;
    return 'https://www.zanmei.ai/' . $url;
}

function getImages(int $id): array {
    if ($id <= 0) return ['success' => false, 'id' => $id, 'error' => '歌谱 ID 无效', 'images' => []];
    $pageUrl = DETAIL_BASE . $id . '.html';
    $r = fetchUrl($pageUrl);
    if (!$r['ok']) return ['success' => false, 'id' => $id, 'detail_url' => $pageUrl, 'error' => $r['error'], 'images' => []];

    $html = $r['body'];
    $images = [];
    if (class_exists('DOMDocument')) {
        $dom = new DOMDocument();
        $prev = libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="utf-8" ?>' . $html);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        $xpath = new DOMXPath($dom);
        foreach ($xpath->query("//*[contains(concat(' ', normalize-space(@class), ' '), ' img_tab ')]//img | //*[contains(concat(' ', normalize-space(@class), ' '), ' img_tab ')]//a[@href]") as $node) {
            if (!$node instanceof DOMElement) continue;
            $raw = $node->hasAttribute('src') ? $node->getAttribute('src') : $node->getAttribute('href');
            if ($raw === '' && $node->hasAttribute('data-src')) $raw = $node->getAttribute('data-src');
            $url = absoluteUrl($raw);
            if ($url !== '' && preg_match('~\.(jpe?g|png|webp)(?:\?.*)?$~i', $url)) {
                $images[$url] = ['url' => $url, 'direct_url' => $url, 'alt' => $node->getAttribute('alt') ?: $node->getAttribute('title')];
            }
        }
    } else {
        if (preg_match_all('~<div[^>]*class=["\'][^"\']*\bimg_tab\b[^"\']*["\'][^>]*>(.*?)</div>~is', $html, $blocks)) {
            foreach ($blocks[1] as $block) {
                if (preg_match_all('~(?:src|data-src|href)=["\']([^"\']+\.(?:jpe?g|png|webp)(?:\?[^"\']*)?)["\']~i', $block, $matches)) {
                    foreach ($matches[1] as $raw) {
                        $url = absoluteUrl($raw);
                        $images[$url] = ['url' => $url, 'direct_url' => $url, 'alt' => ''];
                    }
                }
            }
        }
    }

    return [
        'success' => true,
        'id' => $id,
        'detail_url' => $pageUrl,
        'image_count' => count($images),
        'images' => array_values($images)
    ];
}

$action = strtolower(trim((string)($_GET['action'] ?? 'search')));
$q = trim((string)($_GET['q'] ?? ''));
$page = max(1, (int)($_GET['page'] ?? $_GET['page_no'] ?? 1));
$id = (int)($_GET['id'] ?? 0);
$includeImages = filter_var($_GET['include_images'] ?? '1', FILTER_VALIDATE_BOOLEAN);

// id 模式：输出该歌谱详情和图片直链。
if ($id > 0 || in_array($action, ['detail', 'images'], true)) {
    if ($id <= 0) outputJson(['success' => false, 'error' => '请传入正整数 id'], 400);
    $detail = getImages($id);
    outputJson([
        'success' => (bool)($detail['success'] ?? false),
        'action' => 'detail',
        'id' => $id,
        'detail' => $detail
    ]);
}

if ($action !== 'search') {
    outputJson(['success' => false, 'error' => '不支持的 action', 'supported_actions' => ['search', 'detail', 'images']], 400);
}
if ($q === '') {
    outputJson([
        'success' => false,
        'error' => '请传入搜索关键词 q',
        'usage' => [
            'search' => '?q=奇妙作为&page=1',
            'search_with_images' => '?q=奇妙作为&page=1&include_images=1',
            'detail' => '?id=49795'
        ]
    ], 400);
}
if (function_exists('mb_strlen') && mb_strlen($q, 'UTF-8') > 100) {
    outputJson(['success' => false, 'error' => '搜索关键词不能超过 100 个字符'], 400);
}

$searchUrl = SEARCH_API . '?' . http_build_query(['f' => 'json', 'page_no' => $page, 'q' => $q]);
$r = fetchUrl($searchUrl);
if (!$r['ok']) outputJson(['success' => false, 'action' => 'search', 'error' => $r['error'], 'upstream_status' => $r['status']], 502);
$data = json_decode($r['body'], true);
if (!is_array($data)) outputJson(['success' => false, 'action' => 'search', 'error' => '上游返回的不是有效 JSON'], 502);

$items = [];
foreach (($data['mItems'] ?? []) as $item) {
    if (!is_array($item)) continue;
    $tabId = (int)($item['mTabId'] ?? 0);
    $one = [
        'id' => $tabId,
        'title' => (string)($item['mTabName'] ?? $item['mTitle'] ?? ''),
        'full_title' => (string)($item['mTitle'] ?? ''),
        'artist' => (string)($item['mArtistName'] ?? ''),
        'songbook' => (string)($item['mSongbook'] ?? ''),
        'tags' => (string)($item['mTags'] ?? ''),
        'detail_url' => $tabId > 0 ? DETAIL_BASE . $tabId . '.html' : null,
        'images' => []
    ];
    // 默认把每个搜索结果的歌谱图片也抓取出来；如要更快可设 include_images=0。
    if ($includeImages && $tabId > 0) {
        $imgData = getImages($tabId);
        $one['images'] = $imgData['images'] ?? [];
        $one['image_count'] = count($one['images']);
        $one['image_error'] = ($imgData['success'] ?? false) ? null : ($imgData['error'] ?? '图片获取失败');
    }
    $items[] = $one;
}

outputJson([
    'success' => true,
    'action' => 'search',
    'query' => (string)($data['mQuery'] ?? $q),
    'page' => (int)($data['pageNo'] ?? $page),
    'total_pages' => (int)($data['mPagesTotal'] ?? 0),
    'total_results_on_page' => (int)($data['mRnNum'] ?? count($items)),
    'count' => count($items),
    'items' => $items,
    'source' => $searchUrl
]);
